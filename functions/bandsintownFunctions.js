
var rp = require('request-promise');
const functions = require('firebase-functions');

//import functions from other files
const presentationFunctions = require('./presentationFunctions');


//firebase stuff----------------------------------------------------------------------------------------------------


var admin = require("firebase-admin");

var db = admin.database();


const SpotifyWebApi = require('spotify-web-api-node');
const Spotify = new SpotifyWebApi({
    clientId: functions.config().spotify.client_id,
    clientSecret: functions.config().spotify.client_secret,
    redirectUri: `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/popup.html`
});




//save event the user is interested in to the database
function saveCurrentEventsToDatabase(spotifyUsername,events) {
    var userRef = db.ref('spotifyUsers/'+spotifyUsername+'/currentEvents');

    userRef.remove().then(function(){

        for (var x in events){
            userRef.push(events[x]);
        }

    }).catch(function(err){
        console.log("Error in replacing currentEvents " +err);
    })
}

var uniqueA = function(xs) {
    return xs.filter(function(x, i) {
        return xs.indexOf(x) === i
    })
}



//get bandsintown events for an artist
function getEventsForArtistWithinDateRange (artistString,dateRange) {

    var artistString = encodeURIComponent(artistString); //convert artist string into correct format for Bandsintown API


    var dateRange = dateRange;


   // console.log("DATERANGE :" + dateRange);

    var startOfDateRange;
    var endOfDateRange;

    //if user gives no time period, then make date range from now until a year from now
    if (dateRange == 'nothing'){
        startOfDateRange = new Date().toJSON().substring(0,10);      //get date now and convert into correct format for Bandsintown API
        endOfDateRange = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toJSON().substring(0,10);  //get date a year from now and convert into correct format for Bandsintown API

    }
    else {
        //get start and end date from the given date range
        startOfDateRange = dateRange.slice(0, dateRange.indexOf("/"));
        endOfDateRange = dateRange.substring(dateRange.indexOf("/") + 1);
    }

    console.log(startOfDateRange)
    console.log(endOfDateRange)



    //return promise to events for artist within date range
    return rp('https://rest.bandsintown.com/artists/'+ artistString + '/events?app_id=concertfinder&date='+startOfDateRange+'%2C'+endOfDateRange);       //send request to Bandsintown API
}



//find an event for the artist based on their listening preferences and query
exports.findArtistEventUserLikes = function (app) {

    //get access token of signed in user
    let token = app.getArgument('accesstoken');

    let targetCity = app.getArgument('geo-city');
    let targetCountry = app.getArgument('geo-country');


    let date = app.getArgument('date-period');


    Spotify.setAccessToken(token);


    //Get the authenticated user.
    Spotify.getMe()
        .then(function(userData) {
            console.log('Some information about the authenticated user', userData.body);

            var username = userData.body.id;
            username = 'spotify:'+username;


            //get database reference to the artists the user likes
            var userRef = db.ref('spotifyUsers/'+username +'/artists');

            var artists = []

            userRef.on('value',function(snapshot){      //get the artists the users likes from database
                var artists = snapshot.val();


                console.log(artists.length);

                let count = 0;

                var eventArtistDict = {};       //dictionary to hold artists as key and the artists respective events as values


                for (let i = 0; i < artists.length; i++){

                    let artist = artists[i];

                    console.log(artist);

                    //get events for each artist the user likes
                    getEventsForArtistWithinDateRange(artist,date).then(function(res){
                        var events = JSON.parse(res);
                        var numOfEvents = events.length;

                        console.log("event Data.......... : " + events);

                        console.log("Number of events? : "+ numOfEvents );

                        eventArtistDict[artist] = events;           //put each artists and their events in dictionary

                        count++;

                        let artistsWithEvents = [];              //to hold artists we have found which are having events (google home output)

                        if (count == artists.length){           //we have got events for each artist from bandsintown

                            console.log(eventArtistDict);

                            var targetCityEvents = [];          //list to hold events for that are in the relevant city

                            for (var key in eventArtistDict) {

                                if (eventArtistDict[key].length !== 0){     //if there are any events
                                    let q = 0
                                    for (let i = 0; i < eventArtistDict[key].length; i++){
                                        if (q >= 29){
                                            break;
                                        }
                                        if ((eventArtistDict[key][i].venue.city == targetCity)||(eventArtistDict[key][i].venue.country == targetCountry)){  //if the city the potential event is in is the same as the target city or country
                                            q++;
                                            targetCityEvents.push(eventArtistDict[key][i]);     //we have found an event the user will be interested in in the relevant city or country
                                            artistsWithEvents.push((eventArtistDict[key][i].lineup).join())
                                        }
                                    }
                                }

                            }

                            artistsWithEvents = uniqueA(artistsWithEvents) //so that each artist name only occurs once (google home)

                            artistsWithEvents.splice(-1, 0, ' and ');      //insert 'and' as second from last item in array so that agents grammar is correct

                            console.log(artistsWithEvents);

                            console.log("TARGET CITY EVENTS  " + targetCityEvents);

                            saveCurrentEventsToDatabase(username,targetCityEvents);     //save current events found to database


                            if (targetCityEvents.length > 0){


                                let hasScreen = app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT); //check if there is a visual display           (ie whether the user is using Google Assistant or Google Home)
                                if (hasScreen){
                                    presentationFunctions.presentAsList(targetCityEvents,app,targetCity,'city'); //visual display formatted response
                                } else {
                                    app.ask("I have found you some events that " + artistsWithEvents + " are playing at." +
                                        " Would you be interested in seeing any of them?");                      //Google Home formatted formatted response
                                }
                            } else {
                                app.ask("Looks like there arent any events coming up you'd be interested in in " + targetCity);
                            }

                        }

                    }).catch(function(err){
                        console.log(err);
                    })
                }
            })

        }, function(err) {
            console.log(err);
            app.ask(app.buildRichResponse()
                // Create a basic card and add it to the rich response
                    .addSimpleResponse('Looks like you need to log into spotify, log in and then try again')
                    .addBasicCard(app.buildBasicCard('Could you please log into Spotify')
                        .setTitle('Log into Spotify')
                        .addButton('Log In', 'https://eventagent-401c3.firebaseapp.com')
                        .setImage('//logo.clearbit.com/spotify.com', 'Image alternate text')
                        .setImageDisplay('CROPPED')
                    )
            );
        });


};



//find event for a particular artist
exports.findArtistEventBandsintownInDateRange = function (app) {
    let token = app.getArgument('accesstoken');

    let artist = app.getArgument('music-artist');
    let date = app.getArgument('date-period');

    Spotify.setAccessToken(token);

    //get events from artist name in next year with bandsintown API
    getEventsForArtistWithinDateRange(artist,date).then(function(res){
        console.log(res);

        var events = JSON.parse(res);
        var numOfEvents = events.length;

        console.log("event Data.......... : " + events);

        console.log("Number of events? : "+ numOfEvents );

        Spotify.getMe().then(function(userData){

            var username = userData.body.id;
            username = 'spotify:'+username;

            saveCurrentEventsToDatabase(username,events);

            let cityList = [];

            for(var x in events){
                cityList.push(events[x].venue.city);
            }

            cityList = uniqueA(cityList); //so that each city name only occurs once (google home)

            cityList.splice(-1, 0, ' and ');      //insert 'and' as second from last item in array so that agents grammar is correct

            let hasScreen = app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT);    //check if there is a screen display (ie whether the user is using Google Assistant or Google Home)

            if (hasScreen){
                presentationFunctions.presentAsList(events,app,artist,'artist');
                /*
                 if (numOfEvents >= 8){
                 presentationFunctions.presentAsList(events,app,artist,'artist');
                 } else {
                 presentationFunctions.presentAsCarousel(events,app,artist,'artist');
                 }
                 */
            } else {
                app.ask("I have found some events " + artist + " is playing at in " + cityList + ". Would you be interested in seeing " + artist + " in any of these cities?" );
                //app.ask(artist + "is playing at " + presentationFunctions.getGoogleHomeOutput(events,'artist')  );           //function to get google home formatted response
            }
        }).catch(function(err){
            console.log(err);
            app.ask(app.buildRichResponse()
                // Create a basic card and add it to the rich response
                    .addSimpleResponse('Looks like you need to log into spotify, log in and then try again')
                    .addBasicCard(app.buildBasicCard('Could you please log into Spotify')
                        .setTitle('Log into Spotify')
                        .addButton('Log In', 'https://eventagent-401c3.firebaseapp.com')
                        .setImage('//logo.clearbit.com/spotify.com', 'Image alternate text')
                        .setImageDisplay('CROPPED')
                    )
            );
        })


    }).catch(function(err){

        console.log("Error Occurred! " + err);

    })

};


