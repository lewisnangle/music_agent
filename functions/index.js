/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const functions = require('firebase-functions');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');



//firebase stuff----------------------------------------------------------------------------------------------------


var admin = require("firebase-admin");


var serviceAccount = require("./service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://musicplayer-d2fbc-761fa.firebaseio.com/"
});

var db = admin.database();



//spotify-firebase----------------------------------------------------------------------------------------------------

var spotifyApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`
},"spotifyApp");


// Spotify OAuth 2 setup
// TODO: Configure the `spotify.client_id` and `spotify.client_secret` Google Cloud environment variables.
const SpotifyWebApi = require('spotify-web-api-node');
const Spotify = new SpotifyWebApi({
    clientId: functions.config().spotify.client_id,
    clientSecret: functions.config().spotify.client_secret,
    redirectUri: `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/popup.html`
});

// Scopes to request.
const OAUTH_SCOPES = ['user-read-email','user-follow-read','user-top-read','playlist-read-private'];

/**
 * Redirects the User to the Spotify authentication consent screen. Also the 'state' cookie is set for later state
 * verification.
 */
exports.redirect = functions.https.onRequest((req, res) => {
    cookieParser()(req, res, () => {
        const state = req.cookies.state || crypto.randomBytes(20).toString('hex');
        console.log('Setting verification state:', state);
        res.cookie('state', state.toString(), {maxAge: 3600000, secure: true, httpOnly: true});
        const authorizeURL = Spotify.createAuthorizeURL(OAUTH_SCOPES, state.toString());
        res.redirect(authorizeURL);
    });
});

/**
 * Exchanges a given Spotify auth code passed in the 'code' URL query parameter for a Firebase auth token.
 * The request also needs to specify a 'state' query parameter which will be checked against the 'state' cookie.
 * The Firebase custom auth token is sent back in a JSONP callback function with function name defined by the
 * 'callback' query parameter.
 */
exports.token = functions.https.onRequest((req, res) => {
    try {
        cookieParser()(req, res, () => {
            console.log('Received verification state:', req.cookies.state);
            console.log('Received state:', req.query.state);
            if (!req.cookies.state) {
                throw new Error('State cookie not set or expired. Maybe you took too long to authorize. Please try again.');
            } else if (req.cookies.state !== req.query.state) {
                throw new Error('State validation failed');
            }
            console.log('Received auth code:', req.query.code);
            Spotify.authorizationCodeGrant(req.query.code, (error, data) => {
                if (error) {
                    throw error;
                }
                console.log('Received Access Token:', data.body['access_token']);
                Spotify.setAccessToken(data.body['access_token']);

                Spotify.getMe((error, userResults) => {
                    if (error) {
                        throw error;
                    }
                    console.log('Auth code exchange result received:', userResults);
                    // We have a Spotify access token and the user identity now.
                    const accessToken = data.body['access_token'];
                    const spotifyUserID = userResults.body['id'];

                    var code = spotifyUserID + Math.floor(Math.random() * 100); //random code to give to user to get spotify access


                    var profilePic;
                    if ( (userResults.body['images'][0]) == undefined){         //if there is no profile picture defined, give user generic one.
                        profilePic = 'http://oi68.tinypic.com/255mgle.jpg';     //hosted default pic on tinypic.com
                    } else {
                        profilePic = userResults.body['images'][0]['url'];
                    }
                    const userName = userResults.body['display_name'];
                    const email = userResults.body['email'];

                    // Create a Firebase account and get the Custom Auth Token.
                    createFirebaseAccount(spotifyUserID, userName, profilePic, email, accessToken).then(
                        firebaseToken => {
                            // Serve an HTML page that signs the user in and updates the user profile.
                            res.jsonp({token: firebaseToken});
                        });
                });
            });
        });
    } catch (error) {
        return res.jsonp({error: error.toString});
    }
});

/**
 * Creates a Firebase account with the given user profile and returns a custom auth token allowing
 * signing-in this account.
 * Also saves the accessToken to the datastore at /spotifyAccessToken/$uid
 *
 * @returns {Promise<string>} The Firebase custom auth token in a promise.
 */
function createFirebaseAccount(spotifyID, displayName, photoURL, email, accessToken) {
    // The UID we'll assign to the user.
    const uid = `spotify:${spotifyID}`;

    // Save the access token to the Firebase Realtime Database.
    const databaseTask = admin.database().ref(`/spotifyAccessToken/${uid}`)
        .set(accessToken);

    // Create or update the user account.
    const userCreationTask = admin.auth().updateUser(uid, {
        displayName: displayName,
        photoURL: photoURL,
        email: email,
        emailVerified: true
    }).catch(error => {
        // If user does not exists we create it.
        if (error.code === 'auth/user-not-found') {
            return admin.auth().createUser({
                uid: uid,
                displayName: displayName,
                photoURL: photoURL,
                email: email,
                emailVerified: true
            });
        }
        throw error;
    });

    // Wait for all async tasks to complete, then generate and return a custom auth token.
    return Promise.all([userCreationTask, databaseTask]).then(() => {
        // Create a Firebase custom auth token.
        return admin.auth().createCustomToken(uid).then((token) => {
            console.log('Created Custom token for UID "', uid, '" Token:', token);
            return token;
        });
    });
}




//write user data.
function writeUserData(name,musicGenres,artists) {
    var userRef = db.ref('users/');

    userRef.child(name).set({
        username:name,
        genres: musicGenres,
        artists: artists
    })

}

//write spotify user data.
function writeSpotifyUserData(spotifyUsername,artists) {
    var userRef = db.ref('spotifyUsers/');

    userRef.child(spotifyUsername).set({
        artists: artists
    })

}

//takes two concatenated arrays and returns an array without any duplicates.
function arrayUnique(array) {
    var a = array.concat();
    for(var i=0; i<a.length; ++i) {
        for(var j=i+1; j<a.length; ++j) {
            if(a[i] === a[j])
                a.splice(j--, 1);
        }
    }

    return a;
}







//Dialogflow----------------------------------------------------------------------------------------------------


process.env.DEBUG = 'actions-on-google:*';
const App = require('actions-on-google').DialogflowApp;


// a. the action name from the Dialogflow intent
const FIND_BASIC_EVENTS_ACTION = 'find_basic_events';
const FIND_ARTIST = 'find_artist';
const WELCOME_PICK_USERNAME = 'Welcome.Welcome-no';
const SPOTIFY_LOGIN_ACTION = 'spotify_login';
const SPOTIFY_LOGGED_IN_ACTION = 'spotify_logged_in';
const SPOTIFY_ACCESS_ACTION = 'spotify_access';
const SPOTIFY_SONG_RECOMMENDATION = 'spotify_song_recommendation';
const FIND_ARTIST_EVENT_BANDSINTOWN_inNextYear = 'find_artist_event_bandsintown_inNextYear';

// b. the parameters that are parsed from the make_name intent
const ARTIST_ARGUMENT = 'music-artist';
const CITY_ARGUMENT = 'geo-city';
const USERNAME_ARGUMENT = 'users-name';
const MUSIC_GENRES_ARGUMENT = 'music-genres';
const MUSIC_ARTISTS_ARGUMENT = 'music-artists';
const SPOTIFY_USERNAME = 'spotify_username';
const ARTIST = 'artist';


exports.MusicPlayer = functions.https.onRequest((request, response) => {
    const app = new App({request, response});


    console.log('Request headers: ' + JSON.stringify(request.headers));
    console.log('Request body: ' + JSON.stringify(request.body));

 //   var sessionID = request.body.sessionId;          //get the sessionId of the request.


 //   console.log("Session ID in dialogflow... : " + sessionID);

//------------------------------------------------------------Events and geocoding------------------------------
    var NodeGeocoder = require('node-geocoder');            //require node-geocoder for converting location names into coordinates
    var request = require('request');             //require the request module for calling the Skiddle API.
    var skiddleKey = '7b8ab215e66d06e23c5f8b6a691de015';
    var geoCodeKey = 'AIzaSyDHtzdPWL_4k-NFqrzV3LPA0DS1kxravII';



    var optionsGeo = {
        provider: 'google',
        httpAdapter: 'https', // Default
        apiKey: geoCodeKey, // for Mapquest, OpenCage, Google Premier
        formatter: null         // 'gpx', 'string', ...
    };

    var geocoder = NodeGeocoder(optionsGeo);
    var rp = require('request-promise');



//Get the geo data from the city name
    function getGeoData(city){
        return new Promise(function(resolve,reject){
            geocoder.geocode(city, function(err,res) {
                if(res) //If no result, then error
                    resolve(res)
                else
                    reject(err)
            });
        })

    };

//get skiddle events from coordinates
    function getBasicSkiddleEvents(latitude,longitude){
        return rp('https://www.skiddle.com/api/v1/events/search/?api_key=' + skiddleKey + '&latitude=' + latitude + '&longitude=' + longitude + '&radius=5&eventcode=LIVE&order=distance&description=1')
    }

//get skiddle events from artist name
    function findSkiddleArtist(artist){
        return rp('https://www.skiddle.com/api/v1/events/search/?api_key=' +  skiddleKey + '&keyword=' + artist)
    }

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

    //function to get flickr request
    function flickrRequest (keyword){
        return rp('https://api.flickr.com/services/feeds/photos_public.gne?tags=' + keyword +'&format=json');
    }


//--------------------------------------------------------------------------------------------------------------------------


// c. The functions


    function findArtistEventBandsintownInNextYear (app) {
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


                    http://oi68.tinypic.com/255mgle.jpg



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



    }



    function spotifySongRecommendation (app) {

        //"Can you recommend me something i can dance to?"
        //"Can you recommend me something fast?"


        //Create a function which has parameters the same as the Tuneable Track attributes in the Spotify Web API.
        //Then make a request for a recommendation to the Spotify Web API with those attributes as headers.

        //Javascipt functions with optional parameters?



    }




    //function to populate database with information from the user's spotify
    function spotifyAccess (app) {
        let token = app.getArgument('accesstoken');


        Spotify.setAccessToken(token);

        //Get the authenticated user.
        Spotify.getMe()
            .then(function(userData) {
                console.log('Some information about the authenticated user', userData.body);

                var username = userData.body.id;
                username = 'spotify:'+username;             //to keep spotify usernames consistent throughout app.

                //Get the artist the user follows.
                Spotify.getFollowedArtists({limit : 50})
                    .then(function(data) {
                        let artists = data.body.artists.items;
                        let numberOfArtists = data.body.artists.total;

                        let artistList = [];


                        //iterate through the artists the user follows and add them to artistList
                        for (let i = 0; i < numberOfArtists; i++){
                            try{
                                artistList.push(artists[i].name);
                            } catch (err) {
                                console.log("Error occurred: " + err);
                            }
                        }

                        //get spotify top users
                        userTopArtists(token).then(function(res){
                            console.log(res);

                            let numTopArtists = res.total;
                            let artistObjects = res.items;

                            let topArtistList = [];

                            for (let i = 0; i < numTopArtists; i ++){
                                try {
                                    topArtistList.push(artistObjects[i].name);
                                } catch (err) {
                                    console.log("Error occurred: " + err);
                                }
                            }

                            //combine users top artists and followed artists

                            var artistsCombined = arrayUnique(artistList.concat(topArtistList));

                            console.log("You artists Combined are : "+ artistsCombined);

                            console.log("Your top artists are : " + topArtistList);


                            //write the username and artists the user likes to database.
                            writeSpotifyUserData(username,artistsCombined);


                            app.tell("The artists you like are :" + artistsCombined);


                        }).catch(function(err){
                            console.log("Something went wrong went wrong when finding top artists! " + err);
                        })

                    }, function(err) {
                        console.log('Something went wrong when getting followed artists!', err);
                    });


            }, function(err) {
                console.log('Something went wrong when getting user!', err);
            });






    }

    function spotifyLoggedIn (app) {
        let username = app.getArgument(SPOTIFY_USERNAME);       //get spotify username of current user

        var spotifyAccessRef = db.ref('spotifyAccessToken/' + username);            //get access token from spotify username in database

        spotifyAccessRef.once("value",snapshot => {     //check if the user has logged into spotify.
            const accessToken = snapshot.val();
            if (accessToken){

                let responseJson = {};      //custom JSON response

                responseJson.speech = 'Great! You are connected, now what would you like me to do?';    //speech output of response
                responseJson.displayText = 'Great! you are connected, now what would you like me to do?';   //text output of response
                var contextStr = '[{"name":"spotify_access", "lifespan":5, "parameters":{"accesstoken": "'+ accessToken + '"}}]';   //context string, setting context to spotify_access and passing the access token as a parameter.
                var contextObj = JSON.parse(contextStr);    //put string in JSON object.
                responseJson.contextOut = contextObj;       //put context object in JSON response
                console.log('Response:'+JSON.stringify(responseJson));
                response.json(responseJson);        //send JSON response.


            } else {
                app.tell("Are you sure you have signed in?");
            }
        });

    }


    function spotifyLogin(app){
        app.tell("Could you please open https://musicplayer-d2fbc.firebaseapp.com in your browser"
        + " and sign into spotify. Then tell dialogflow that you have logged in.");
    }


    function welcomePickUsername (app) {
        let nameUserWants = app.getArgument(USERNAME_ARGUMENT);        //get name of user

        let genres = 'rap';
        let artists = 'acdc';



        var userRef = db.ref('users/');
        userRef.orderByChild("username").equalTo(nameUserWants).once("value",snapshot => {     //check if username already exists
            const userData = snapshot.val();
            if (userData){
                app.tell(nameUserWants + " already exists, can you pick another one.");
            } else {
                writeUserData(nameUserWants,genres,artists);
                app.tell(nameUserWants + ", I have remembered your music taste.");
            }
        });





        //    app.tell('You wont be forgotten ' + name + ". \xa0" + "The genres you like are : " + genres + " The artists you like are: " + artists );

    }



    function findBasicEvent (app) {

        let city = app.getArgument(CITY_ARGUMENT);          //get specified city argument from dialogFlow

        getGeoData(city).then(function(r){                  //get the geodata from the specified city using Google API
            var data = r;

            JSON.stringify(data);

            //get latitude and longitude from geodata
            var latitude = data[0]['latitude'];
            var longitude = data[0]['longitude'];


            getBasicSkiddleEvents(latitude,longitude).then(function (res) {     //use latitude and longitude with skiddle API to return an events object
                var data = res;

                var results = JSON.parse(data).results;                    //get results of events object
                var pageCount = JSON.parse(data).pagecount;                //get page count

                var eventList = [];                                         //list to hold event names

                for(let i = 0; i<pageCount;i++){
                    eventList.push(results[i]['eventname']);                //put events in list
                }

                var outputString = eventList.join(',  ');                    //turn events into string to be outputted through Dialogflow

                app.tell("Here is a list of events happening in " + city + ": " + outputString); //provide response to user

            }).catch(function (err) {
                console.log("Error Occurred :" + err);          //catch errors from SkiddleEvents function
            });

        }).catch(function(err){
                console.log('error occurred: ' + err)               //catch errors from geodata function
            }
        )
    }

    function findArtist (app){
        let artist = app.getArgument(ARTIST_ARGUMENT);


        findSkiddleArtist(artist).then(function(res){
            var data = res;


            var results = JSON.parse(data).results;
            var pageCount = JSON.parse(data).pagecount;


            var eventDict = {};             //dictionary of events, where key is the venue name and value is the act/name of the event

            for(let i = 0; i<pageCount;i++) {
                eventDict[results[i]['venue']['name']] = results[i]['eventname'];      //fill dictionary with venue and event names
            }


            var eventList = []                  //list to hold venues and events names as list


            for (var key in eventDict) {
                if (eventDict.hasOwnProperty(key)) {
                    eventList.push( [key, eventDict[key]]);         //put each list of venue and event name in to list
                }
            }

            var eventFormattedList = [];            //list to hold formatting


            for (var i = 0; i <eventList.length; i++){
                eventFormattedList.push(eventList[i].join(', is Hosting: '));      //format each list to say "venue, is Hosting: event"
            }

            var outputString = eventFormattedList.join(", \xa0");               //format string to be outputted

            app.tell(outputString);                             //provide response to user


        }).catch(function(e){
            console.log("Error Occurred: "+e);
        })

    }

    // d. build an action map, which maps intent names to functions
    let actionMap = new Map();
    actionMap.set(FIND_ARTIST_EVENT_BANDSINTOWN_inNextYear,findArtistEventBandsintownInNextYear);
    actionMap.set(SPOTIFY_SONG_RECOMMENDATION,spotifySongRecommendation);
    actionMap.set(SPOTIFY_ACCESS_ACTION,spotifyAccess);
    actionMap.set(SPOTIFY_LOGGED_IN_ACTION,spotifyLoggedIn);
    actionMap.set(SPOTIFY_LOGIN_ACTION,spotifyLogin);
    actionMap.set(WELCOME_PICK_USERNAME,welcomePickUsername);
    actionMap.set(FIND_BASIC_EVENTS_ACTION,findBasicEvent);
    actionMap.set(FIND_ARTIST,findArtist);


    app.handleRequest(actionMap);
});