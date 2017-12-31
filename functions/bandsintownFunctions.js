const ARTIST = 'artist';

var rp = require('request-promise');
const functions = require('firebase-functions');

var funcs = require('./functions.js');


//firebase stuff----------------------------------------------------------------------------------------------------


var admin = require("firebase-admin");

var db = admin.database();


const SpotifyWebApi = require('spotify-web-api-node');
const Spotify = new SpotifyWebApi({
    clientId: functions.config().spotify.client_id,
    clientSecret: functions.config().spotify.client_secret,
    redirectUri: `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/popup.html`
});


//get a users top artists
function userTopArtists (token){
    var options = {
        uri: 'https://api.spotify.com/v1/me/top/artists?limit=50',
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization': 'Bearer ' + token
        },
        json: true // Automatically parses the JSON string in the response
    };
    return rp(options)
}


//get bandsintown events for an artist
function getEventsForArtistWithinNextYear (artistString) {
    var artistString = encodeURIComponent(artistString.trim()); //convert artist string into correct format for Bandsintown API
    var dateNow = new Date().toJSON().substring(0,10);      //get date now and convert into correct format for Bandsintown API
    var yearFromNow = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toJSON().substring(0,10);  //get date a year from now and convert into correct format for Bandsintown API

    //console.log("The date now is : "+dateNow);
    //console.log("The date a year from now... is : "+ yearFromNow);


    return rp('https://rest.bandsintown.com/artists/'+ artistString + '/events?app_id=someappid&date='+dateNow+'%2C'+yearFromNow);       //send request to Bandsintown API
}


exports.findArtistEventUserLikes = function (app) {

    //get access token of signed in user
    let token = app.getArgument('accesstoken');
    let targetCity = app.getArgument('geo-city');

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
                    getEventsForArtistWithinNextYear(artist).then(function(res){
                        var events = JSON.parse(res);
                        var numOfEvents = events.length;

                        console.log("event Data.......... : " + events);

                        console.log("Number of events? : "+ numOfEvents );

                        eventArtistDict[artist] = events;           //put each artists and their events in dictionary

                        count++;

                        if (count == artists.length){           //we have got events for each artist from bandsintown

                            console.log(eventArtistDict);

                            var targetCityEvents = [];          //list to hold events for that are in the relevant city

                            for (var key in eventArtistDict) {

                                if (eventArtistDict[key].length !== 0){     //if there are any events

                                    for (let i = 0; i < eventArtistDict[key].length; i++){
                                        if (eventArtistDict[key][i].venue.city == targetCity){  //if the city the potential event is in is the same as the target city
                                            targetCityEvents.push(eventArtistDict[key][i]);     //we have found an event the user will be interested in in the relevant city
                                        }
                                    }
                                }

                            }

                            var eventsToPresentToUser = [];

                            if (targetCityEvents.length > 0){

                                for (let i = 0; i <targetCityEvents.length; i++){
                                    eventsToPresentToUser.push(targetCityEvents[i].venue.name);
                                }
                                app.tell("Here are some events in "+targetCity + ": " + eventsToPresentToUser);
                            } else {
                                app.tell("Looks like there arent any events coming up you'd be interested in in " + targetCity);
                            }

                        }

                    }).catch(function(err){
                        console.log(err);
                    })


                }



            })





        }, function(err) {
            console.log('Something went wrong when getting user!', err);
        });


};


//function to get flickr request
function flickrRequest (keyword){
    return rp('https://api.flickr.com/services/feeds/photos_public.gne?tags=' + keyword +'&format=json');
}


exports.findArtistEventBandsintownInNextYear = function (app) {
    let artist = app.getArgument(ARTIST);

    //get events from artist name in next year with bandsintown API
    getEventsForArtistWithinNextYear(artist).then(function(res){


        var events = JSON.parse(res);
        var numOfEvents = events.length;

        console.log("event Data.......... : " + events);

        console.log("Number of events? : "+ numOfEvents );


        var eventsList = [];


        var carouselList = [];



        //if just one event, we need to present basic card to user. Otherwise present them with carousel list.
        if (numOfEvents == 1){

            let event = events[0];

            //flickr request to get photo of venue
            flickrRequest(event.venue.name).then(function(res){
                //manipulate the Flickr API response so that it is in JSON form
                var data = res.substring(15);
                data = data.slice(0,-1);
                data = JSON.parse(data);


                var imageUrl;   //get image url of picture of venue

                if (data.items[0] == undefined){
                    imageUrl = 'http://oi68.tinypic.com/255mgle.jpg';
                } else {
                    imageUrl = data.items[0].media.m;
                }


                app.ask(app.buildRichResponse()
                    // Create a basic card and add it to the rich response
                        .addSimpleResponse('There is just one place ' + artist + ' is playing:')
                        .addBasicCard(app.buildBasicCard(artist,event.venue.name)
                            .setTitle(event.venue.name)
                            .setImage(imageUrl, 'Image alternate text')
                            .setImageDisplay('CROPPED')
                        )
                );
            }).catch(function(err){
                console.log("Error Occurred with Flickr: " + err);
            })

            //more than one event, so we can present the user with a carousel list
        } else if (numOfEvents >= 2) {

            for (let i = 0; i < numOfEvents; i++){
                let event = events[i];

                //flickr request to get photo of venue
                flickrRequest(event.venue.name).then(function(res){
                    //manipulate the Flickr API response so that it is in JSON form
                    var data = res.substring(15);
                    data = data.slice(0,-1);
                    data = JSON.parse(data);

                    console.log(data);

                    var imageUrl;   //get image url of picture of venue

                    if (data.items[0] == undefined){
                        imageUrl = 'http://oi68.tinypic.com/255mgle.jpg';
                    } else {
                        imageUrl = data.items[0].media.m;
                    }


                    console.log(imageUrl);

                    carouselList.push(app.buildOptionItem(event.venue.name,event.venue.city)
                        .setTitle(event.venue.name)
                        .setDescription(event.description)
                        .setImage(imageUrl, 'Artist Events'))



                    console.log("Carousel List : " + carouselList);

                    console.log("Carousel list size : " + carouselList.length + ".. and numOfEvents: " + numOfEvents );

                    //once we have created a carousel list containing all events, we present it to the user.
                    if (carouselList.length == numOfEvents){
                        app.askWithCarousel('Alright, here are some places ' + artist + ' is playing:',
                            // Build a carousel
                            app.buildCarousel()
                            // Add the first item to the carousel
                                .addItems(carouselList)
                        );
                    }


                }).catch(function(err){
                    console.log("Error occurred with Flickr :"+ err);
                });
            }
        } else if (numOfEvents == 0){
            app.tell("I'm sorry, I wasn't able to find any events in the next year for " + artist);
        }

        //    console.log(eventsList);

        //   app.tell(eventsList);

    }).catch(function(err){
        console.log("Error Occurred! " + err);
    })



};