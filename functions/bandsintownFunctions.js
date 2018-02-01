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



function getGoogleHomeOutput(events,cityOrArtist){
    var eventDict = {};             //dictionary of events, where key is the venue name and value is the act/name of the event
    var numOfEvents = events.length;

    if (cityOrArtist == 'artist'){
        for(let i = 0; i<numOfEvents;i++) {
            eventDict[events[i]['venue']['name']] = events[i]['venue']['city'];      //fill dictionary with venue and event names
        }
    }

    if (cityOrArtist == 'city'){
        for(let i = 0; i<numOfEvents;i++) {
            eventDict[events[i]['lineup']] = events[i]['venue']['name'];      //fill dictionary with venue and event names
        }
    }




    var eventList = []                  //list to hold venues and events names as list


    for (var key in eventDict) {
        if (eventDict.hasOwnProperty(key)) {
            eventList.push( [key, eventDict[key]]);         //put each list of venue and event name in to list
        }
    }

    console.log("THE EVENT LIST " + eventList)

    var eventFormattedList = [];            //list to hold formatting


    for (var i = 0; i <eventList.length; i++){
        eventFormattedList.push(eventList[i].join(', in '));      //format each list to say "venue, is Hosting: event"
    }

    var outputString = eventFormattedList.join(", \xa0");               //format string to be outputted

    console.log("THE OUTPUT STRING IS  " +  outputString)

    return outputString;


}


function presentAsCarousel(eventsToPresent,app,target,type){

    var carouselList = [];

    var events = eventsToPresent;
    var numOfEvents = eventsToPresent.length;


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

            if (type == 'artist') {
                app.ask(app.buildRichResponse()
                    // Create a basic card and add it to the rich response
                        .addSimpleResponse('There is just one place ' + target + ' is playing:')
                        .addBasicCard(app.buildBasicCard(target,event.venue.name)
                            .setTitle(event.venue.name)
                            .setImage(imageUrl, 'Image alternate text')
                            .setImageDisplay('CROPPED')
                        )
                );
            }
            if (type == 'city') {
                app.ask(app.buildRichResponse()
                    // Create a basic card and add it to the rich response
                        .addSimpleResponse('There is only one event in ' + target + ' you might be interested in:')
                        .addBasicCard(app.buildBasicCard(target,event.venue.name)
                            .setTitle(event.venue.name)
                            .setImage(imageUrl, 'Image alternate text')
                            .setImageDisplay('CROPPED')
                        )
                );
            }

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

                carouselList.push(app.buildOptionItem(event.lineup + " - " + event.venue.name + " on " + event.datetime ,event.datetime)
                    .setTitle(event.lineup + " - " + event.venue.name + " on " + event.datetime)
                    .setDescription(event.description)
                    .setImage(imageUrl, 'Artist Events'))


                //once we have created a carousel list containing all events, we present it to the user.
                if (carouselList.length == numOfEvents){

                    if (type == 'artist'){
                        app.askWithCarousel('Alright, here are some places ' + target + ' is playing:',
                            // Build a carousel
                            app.buildCarousel()
                            // Add the first item to the carousel
                                .addItems(carouselList)
                        );
                    }
                    if (type == 'city'){
                        app.askWithCarousel('Alright, here are some events within ' + target + ' in the next year:',
                            // Build a carousel
                            app.buildCarousel()
                            // Add the first item to the carousel
                                .addItems(carouselList)
                        );
                    }

                }


            }).catch(function(err){
                console.log("Error occurred with Flickr :"+ err);
            });
        }
    } else if (numOfEvents == 0){
        if (type == 'artist'){
            app.tell("I'm sorry, I wasn't able to find any events in the next year for " + target);
        }
        if (type == 'city'){
            app.tell("I'm sorry, I wasn't able to find any events you would be interested in within " + target + " in the next year");
        }
    }
}



function presentAsList(eventsToPresent,app,target,type){
    var list = [];

    var events = eventsToPresent;
    var numOfEvents = eventsToPresent.length;


    //if just one event, we need to present basic card to user. Otherwise present them with list.
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


            if (type == 'artist'){
                app.ask(app.buildRichResponse()
                    // Create a basic card and add it to the rich response
                        .addSimpleResponse('There is just one place ' + target + ' is playing:')
                        .addBasicCard(app.buildBasicCard(target,event.venue.name)
                            .setTitle(event.venue.name)
                            .setImage(imageUrl, 'Image alternate text')
                            .setImageDisplay('CROPPED')
                        )
                );
            }

            if (type == 'city'){
                app.ask(app.buildRichResponse()
                    // Create a basic card and add it to the rich response
                        .addSimpleResponse('Ok, here are some events happening in ' + target + ' this year:')
                        .addBasicCard(app.buildBasicCard(target,event.venue.name)
                            .setTitle(event.venue.name)
                            .setImage(imageUrl, 'Image alternate text')
                            .setImageDisplay('CROPPED')
                        )
                );
            }


        }).catch(function(err){
            console.log("Error Occurred with Flickr: " + err);
        })

        //more than one event, so we can present the user with a list
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



                list.push(app.buildOptionItem(event.lineup + " - " + event.venue.name + " on " + event.datetime ,event.datetime)
                    .setTitle(event.lineup + " - " + event.venue.name + " on " + event.datetime)
                    .setDescription(event.description)
                    .setImage(imageUrl, 'Artist Events'))


                //once we have created a list containing all events, we present it to the user.
                if (list.length == numOfEvents){

                    //if target is a city
                    if (type == 'city'){
                        app.askWithList('Alright, here are some events you might be interested in within ' + target,
                            // Build a list
                            app.buildList()
                            // Add the first item to the list
                                .addItems(list)
                        );
                    }

                    if (type == 'artist'){
                        app.askWithList('Alright, here are some places ' + target + ' are playing:',
                            // Build a list
                            app.buildList()
                            // Add the first item to the list
                                .addItems(list)
                        );
                    }

                }


            }).catch(function(err){
                console.log("Error occurred with Flickr :"+ err);
            });
        }
    } else if (numOfEvents == 0){
        if (type == 'artist'){
            app.tell("I'm sorry, I wasn't able to find any events in the next year for " + target);
        }
        if (type == 'city'){
            app.tell("I'm sorry, I wasn't able to find any events you would be interested in within " + target + " in the next year");
        }

    }
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

                            console.log("TARGET CITY EVENTS  " + targetCityEvents);



                            if (targetCityEvents.length > 0){


                                let hasScreen = app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT); //check if there is a screen display (ie whether the user is using Google Assistant or Google Home)

                                if (hasScreen){
                                    if (numOfEvents >= 8){
                                        presentAsList(targetCityEvents,app,targetCity,'city');
                                    } else {
                                        presentAsCarousel(targetCityEvents,app,targetCity,'city');
                                    }
                                } else {

                                    app.tell("Here are some events you might like " + username + " " + getGoogleHomeOutput(targetCityEvents,'city'));           //function to get google home formatted response

                                }

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
        console.log(res);

        var events = JSON.parse(res);
        var numOfEvents = events.length;


        console.log("event Data.......... : " + events);

        console.log("Number of events? : "+ numOfEvents );

        let hasScreen = app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT);    //check if there is a screen display (ie whether the user is using Google Assistant or Google Home)

        if (hasScreen){
            if (numOfEvents >= 8){
                presentAsList(events,app,artist,'artist');
            } else {
                presentAsCarousel(events,app,artist,'artist');
            }
        } else {

            app.tell(artist + "is playing at " + getGoogleHomeOutput(events,'artist')  );           //function to get google home formatted response

        }

    }).catch(function(err){
        console.log("Error Occurred! " + err);
    })



};