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


const funcs = require('./functions.js');            //generic functions

var nodemailer = require('nodemailer'); //nodemailer for sending emails


//function for sending email
function sendEmail(email,uid){
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'a.music.agent.app@gmail.com',
            pass: ''
        }
    });

    var mailOptions = {
        from: 'a.music.agent.app@gmail.com',
        to: email,
        subject: 'Music Agent Login',
        text: 'Here is your spotify login code provided by the music agent: ' + uid + " :)",
    };
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}



//firebase stuff----------------------------------------------------------------------------------------------------


var admin = require("firebase-admin");


var serviceAccount = require("./service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://eventagent-401c3.firebaseio.com/"
});

var db = admin.database();



//spotify-firebase----------------------------------------------------------------------------------------------------

var spotifyApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`
},"spotifyApp");


// Spotify OAuth 2 setup
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
        console.log(authorizeURL);
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

    //var uniqueCode = uid + Math.floor(Math.random() * 100);

    admin.auth().getUser(uid)
        .then(function(userRecord) {
            console.log("Successfully fetched user data:", userRecord.toJSON());
        })
        .catch(function(error) {
            console.log("Error fetching user data:", error);
        });

    var emailAccess= email.substr(0, email.indexOf('@'));

    emailAccess = emailAccess.split('.').join("X");

    // Save the access token to the Firebase Realtime Database.
    const databaseTask = admin.database().ref(`/spotifyAccessToken/${emailAccess}`)
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

          //  sendEmail(email,uid); //send confirmation email to user

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


var rp = require('request-promise');


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
        artists: artists,
        events : null
    })

}


//save event the user is interested in to the database
function saveEventToDatabase(spotifyUsername,event) {
    var userRef = db.ref('spotifyUsers/'+spotifyUsername+'/events');

    userRef.push(event);

}

//save event the user is interested in to the database
function saveCurrentEvent(spotifyUsername,event) {
    var userRef = db.ref('spotifyUsers/' + spotifyUsername + '/currentEvent');

    userRef.set(event);
}

function getCurrentEvents(spotifyUsername){
    var currentEventsRef = db.ref('spotifyUsers/' + spotifyUsername + '/currentEvents');

    currentEventsRef.once("value",snapshot => {
        let currentEvents = snapshot.val();
        return currentEvents;
    })


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




//Dialogflow----------------------------------------------------------------------------------------------------


process.env.DEBUG = 'actions-on-google:*';
const App = require('actions-on-google').DialogflowApp;


// a. the action name from the Dialogflow intent
//const FIND_BASIC_EVENTS_ACTION = 'find_basic_events';
//const FIND_ARTIST = 'find_artist';
const SPOTIFY_LOGIN_ACTION = 'spotify_login';
const SPOTIFY_LOGGED_IN_ACTION = 'spotify_logged_in';
const SPOTIFY_ACCESS_ACTION = 'spotify_access';
const SPOTIFY_SONG_RECOMMENDATION = 'spotify_song_recommendation';
const FIND_ARTIST_EVENT_BANDSINTOWN_inNextYear = 'find_artist_event_bandsintown_inNextYear';
const FIND_ARTIST_EVENT_USER_LIKES = 'find_events_for_artists_user_likes';
const SONG_INFO = 'song_info';
const VENUE_ADDRESS = 'find_venue_address';
const SAVE_EVENT = 'save_event.save_event-custom';
const SAVED_EVENTS = 'saved.events';
const SIGN_IN = 'input.welcome';
const DELETE_SAVED_EVENT = 'getSavedEvents.getSavedEvents-custom';
//const BARS_NEAR_VENUE = 'find_artist_event_bandsintown_inNextYear.find_artist_event_bandsintown_inNextYear-custom';
const SAVE_OR_BARS = 'find_artist_event_bandsintown_inNextYear.find_artist_event_bandsintown_inNextYear-custom';
const BARS_NEAR_VENUE = 'bars.near.venue';
const SAVE_EVENT_O = 'save.event';
const EVENT_OPTION = 'event.option';
const CHOOSE_ARTIST_FROM_EVENTS_FOUND_GHOME = 'choose.artist.from.events.found';
const CHOOSE_CITY_FROM_EVENTS_FOUND_GHOME = 'choose.city.from.events.found';



// b. the parameters that are parsed from the make_name intent
const ARTIST_ARGUMENT = 'music-artist';
const CITY_ARGUMENT = 'geo-city';
const USERNAME_ARGUMENT = 'users-name';
const MUSIC_GENRES_ARGUMENT = 'music-genres';
const MUSIC_ARTISTS_ARGUMENT = 'music-artists';
const SPOTIFY_USERNAME = 'spotify_username';
const ARTIST = 'artist';
const VENUE = 'venue';



exports.EventAgent = functions.https.onRequest((request, response) => {
    const app = new App({request, response});


    console.log('Request headers: ' + JSON.stringify(request.headers));
    console.log('Request body: ' + JSON.stringify(request.body));


    function songInfoFromLastFM(artist,song){
        return rp('http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=bd830d3d033985eb65bca44e084ecf27&artist='+artist+'&track='+song+'&format=json');
    }

    function venueInfoFromTicketMaster(venue){
        return rp('https://app.ticketmaster.com/discovery/v2/venues.json?keyword='+venue+'&apikey=4Y1FGSaYP8LjPAP8oPjLSW1ExUZwCxT5');
    }

    function ticketMasterInfo(artistAndVenue){
        return rp('https://app.ticketmaster.com/discovery/v2/events.json?keyword='+artistAndVenue+'&apikey=4Y1FGSaYP8LjPAP8oPjLSW1ExUZwCxT5');
    }

    function findBarAtGeocoordinates(latitude,longitude){
        return rp('https://maps.googleapis.com/maps/api/place/textsearch/json?key=AIzaSyAdgmuDoO-oKulXBA6LnfHWqJ5wTv4thA8&query="bar"&location='+latitude+','+longitude +'&radius=8000');
        //return rp('https://maps.googleapis.com/maps/api/geocode/json?latlng='+latitude+',' + longitude+'&radius=8000&type=bar&key=AIzaSyAdgmuDoO-oKulXBA6LnfHWqJ5wTv4thA8');
    }

    function findBarGivenVenueName(venueName){
        return rp('https://maps.googleapis.com/maps/api/place/textsearch/json?key=AIzaSyAdgmuDoO-oKulXBA6LnfHWqJ5wTv4thA8&query="bars '+venueName+'"&radius=8000');
    }


    function getOAuthUser (token) {
        var options = {
            method: 'GET',
            url: 'https://eventagent.eu.auth0.com/userinfo', //You can find your URL on Client --> Settings -->
            //Advanced Settings --> Endpoints --> OAuth User Info URL
            headers:{
                authorization: 'Bearer ' + token,
            }
        };

        return rp(options);
    }

//--------------------------------------------------------------------------------------------------------------------------


// c. The functions
    function chooseCityFromEventsFoundGHOME(app){

        let city = app.getArgument('geo-city');
        let token = app.getArgument('accesstoken');
        Spotify.setAccessToken(token);

        Spotify.getMe().then(function(userData){
            var username = userData.body.id;
            username = 'spotify:'+username;

            var currentEventsRef = db.ref('spotifyUsers/'+username+'/currentEvents/');

            currentEventsRef.once("value",snapshot => {


                let eventsInDatabase = snapshot.val();

                let eventList = [];

                var x
                for (x in eventsInDatabase){
                    if(eventsInDatabase[x].venue.city == city){
                        eventList.push(eventsInDatabase[x]);
                    }
                }

                for(x in eventList){
                    saveEventToDatabase(username,eventList[x]);  //save the events the user is interested in in the database
                }

                let artist = eventList[0].lineup;


                if(eventList.length == 1){
                    app.tell("Ok, there is one event for "+ artist + " in " + city + " I have saved it to your events.");
                } else {
                    app.tell("Ok, there are " + eventList.length + " events in " + city + " for " + artist + ". I have saved them to your events.");
                }




            }).catch(function(err){
                console.log(err);
            })


        }).catch(function(err){
            console.log(err);
        })


    }
    function chooseArtistFromEventsFoundGHOME(app){
        let artist = app.getArgument('artist');

        let token = app.getArgument('accesstoken');

        Spotify.setAccessToken(token);

        Spotify.getMe().then(function(userData){
            var username = userData.body.id;
            username = 'spotify:'+username;

            var currentEventsRef = db.ref('spotifyUsers/'+username+'/currentEvents/');

            currentEventsRef.once("value",snapshot => {


                let eventsInDatabase = snapshot.val();

                let eventList = [];

                var x
                for (x in eventsInDatabase){
                    if(eventsInDatabase[x].lineup == artist){
                        eventList.push(eventsInDatabase[x]);
                    }
                }

                for(x in eventList){
                    saveEventToDatabase(username,eventList[x]);  //save the events the user is interested in in the database
                }

                let city = eventList[0].venue.city;

                if(eventList.length == 1){
                    app.tell("Ok, there is one event that " + artist + " is playing at in " + city + ". I have saved it to your events.")
                } else {
                    app.tell("Ok, there are " + eventList.length + " events for " + artist + ", in " + city + ". I have saved them to your events.");
                }




            }).catch(function(err){
                console.log(err);
            })




        }).catch(function(err){
            console.log(err);
        })

    }



    function eventOption (app){
        const param = app.getContextArgument('actions_intent_option',
            'OPTION').value;

        console.log(param);

        if (param) {
            var event = param.substring(param.indexOf("|")+1,param.lastIndexOf("|"));   //get the JSON formatted string containing the selected event information from between the two |'s

            event = JSON.parse(event);      //put event into JSON form to be stored in database correctly

            let token = app.getArgument('accesstoken');

            Spotify.setAccessToken(token);

            Spotify.getMe().then(function(userData){

                var username = userData.body.id;

                username = 'spotify:'+username;

                saveCurrentEvent(username,event)

                let artistAndVenue = event.lineup + ' ' + event.venue.name;

                ticketMasterInfo(artistAndVenue).then(function(res){

                    let ticketMasterEvent = JSON.parse(res)._embedded.events[0];

                    console.log(ticketMasterEvent);

                    app.ask(app.buildRichResponse()
                        .addSimpleResponse('You have selected '+event.lineup)
                        .addSuggestions(
                            ['Save to my events', 'Bars Close By'])
                        .addBasicCard(app.buildBasicCard('You have selected '+event.lineup) // Note the two spaces before '\n' required for a
                        // line break to be rendered in the card
                            .setSubtitle(event.venue.name)
                            .setTitle(ticketMasterEvent.name)
                            .addButton('Find Tickets', ticketMasterEvent.url)
                            .setImage(ticketMasterEvent.images[0].url, 'Image alternate text'))
                    );

                }).catch(function(err){
                    console.log(err);
                });



            })



        }

    }



    function saveEvent_O (app){

        let token = app.getArgument('accesstoken');

        Spotify.setAccessToken(token);

        Spotify.getMe().then(function(userData){

            var username = userData.body.id;
            username = 'spotify:'+username;

            console.log(username);

            var currentEventRef = db.ref('spotifyUsers/'+username+'/currentEvent');

            currentEventRef.once("value",snapshot => {

                let currentEvent = snapshot.val();

                saveEventToDatabase(username,currentEvent)  //save the event the particular user is interested in in the database

                app.ask('You have saved ' + currentEvent.lineup + ' at ' + currentEvent.venue.name + ' to your interested events!');

                getSavedEvents(app);


            }).catch(function(err){
                console.log(err);
            })



        }).catch(function(err){
            console.log(err);
        })

    }

    function findBarsNearVenue (app) {

        const venue = app.getArgument('venue');

        console.log(venue);

        if (venue) {
            findBarGivenVenueName(venue).then(function(res){
                console.log(res);

                let bars = JSON.parse(res);

                console.log("Bars results :" + bars.results);

                presentationFunctions.presentBarsAsList(bars.results,app);
            }).catch(function(err){
                console.log("Error Getting Bars near " + venue + " :" + err);
            })
        } else {
            app.ask("Couldnt find a venue, could you ask that question again?");
        }

    }

    function saveOrBars (app) {

        console.log("saveOrBars INTENT");

        const param = app.getRawInput();


        console.log(param);

        if (param) {
            app.ask(param);
        }


    }

    function barsNearVenue (app) {

        let token = app.getArgument('accesstoken');

        console.log("ACCESSTEOKEN "+token);

        Spotify.setAccessToken(token);

        Spotify.getMe().then(function(userData){

            var username = userData.body.id;
            username = 'spotify:'+username;

            var currentEventRef = db.ref('spotifyUsers/'+username+'/currentEvent');

            currentEventRef.once("value",snapshot => {

                let currentEvent = snapshot.val();

                let lat = currentEvent.venue.latitude;
                let long = currentEvent.venue.longitude;

                findBarAtGeocoordinates(lat,long).then(function(res){

                    console.log(res);
                    let bars = JSON.parse(res);

                    console.log("Bars results :" + bars.results);

                    presentationFunctions.presentBarsAsList(bars.results,app);

                }).catch(function(err){
                    console.log("Error Occurred:  " + err );
                })
            })


        }).catch(function(err){
            console.log(err);
        })

    }


    function deleteSavedEvent (app){

        const param = app.getContextArgument('actions_intent_option',
            'OPTION').value;

        if (param) {
            var event = param.substring(param.indexOf("|")+1,param.lastIndexOf("|"));   //get the JSON formatted string containing the selected event information from between the two |'s

            event = JSON.parse(event);      //put event into JSON form to be stored in database correctly

            let token = app.getArgument('accesstoken');

            Spotify.setAccessToken(token);

            Spotify.getMe().then(function(userData){

                var username = userData.body.id;
                username = 'spotify:'+username;

                var eventRef = db.ref('spotifyUsers/'+username+'/events');

                eventRef.once("value",snapshot => {

                    let eventsInDatabase = snapshot.val();

                    console.log("Event id to delete: " + event.id);

                    var x;
                    for (x in eventsInDatabase){
                        console.log("Event ids that are saved: " + eventsInDatabase[x].id);
                        if (eventsInDatabase[x].id == event.id){
                            console.log("Event To be removed : " + x);
                            let deleteRef = db.ref('spotifyUsers/'+username+'/events/'+x);

                            deleteRef.remove().then(function(){

                                eventRef.once("value",snapshot => {

                                    let eventsInDatabase = snapshot.val();

                                    let eventList = [];

                                    var x
                                    for (x in eventsInDatabase){
                                        eventList.push(eventsInDatabase[x]);
                                    }


                                    console.log(eventList);


                                    let hasScreen = app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT);

                                    if(hasScreen){
                                        presentationFunctions.presentAsList(eventList,app,'','rememberedEvents');
                                    } else {
                                        app.tell("Event successfully removed. Here are your saved events: " + presentationFunctions.getGoogleHomeOutput(eventList,'city'));
                                    }

                                });

                            }).catch(function(){
                                console.log("Error Occurred with removing the event.")
                            })

                        }
                    }

                });

               // app.ask(event);

                /*
                eventRef.remove()
                    .then(function() {
                        console.log("Event removed.")
                    })
                    .catch(function(error) {
                        console.log("Remove failed: " + error.message)
                    });

                */

                //  app.tell("I have printed your events to the console!");

            }).catch(function(err){
                console.log("Error occurred when getting spotify user: " + err);
            })

        }


    }


    function signIn (app) {
        if(app.getUser().access_token){
            let token = app.getUser().access_token;

            console.log("user is signed in, token is : " + token);

            getOAuthUser(token).then(function(data){
                console.log(data);

                let userData = JSON.parse(data);

                let name = userData.given_name;

                if (name === undefined){
                    name = userData.nickname;
                } else {
                    name = userData.name;
                }

                app.ask("Hi, " + name);

            }).catch(function(err){
                console.log("An error occurred :" + err);
            })


        }
    }


    function getSavedEvents (app){

        let token = app.getArgument('accesstoken');

        Spotify.setAccessToken(token);

        Spotify.getMe().then(function(userData){

            var username = userData.body.id;
            username = 'spotify:'+username;

            var eventRef = db.ref('spotifyUsers/'+username+'/events');

            eventRef.once("value",snapshot => {

                let eventsInDatabase = snapshot.val();

                let eventList = [];

                var x
                for (x in eventsInDatabase){
                    eventList.push(eventsInDatabase[x]);
                }


                console.log(eventList);


                let hasScreen = app.hasSurfaceCapability(app.SurfaceCapabilities.SCREEN_OUTPUT);

                if(hasScreen){
                    presentationFunctions.presentAsList(eventList,app,'','rememberedEvents');
                } else {
                    app.tell("Here are your saved events: " + presentationFunctions.getGoogleHomeOutput(eventList,'city'));
                }




            });


          //  app.tell("I have printed your events to the console!");

        }).catch(function(err){
            console.log("Error occurred when getting spotify user: " + err);
        })

    }


    function saveEvent (app) {
        // Get the user's selection
        const param = app.getContextArgument('actions_intent_option',
            'OPTION').value;


        if (param) {       //if the user selected an option

            var event = param.substring(param.indexOf("|")+1,param.lastIndexOf("|"));   //get the JSON formatted string containing the selected event information from between the two |'s

            event = JSON.parse(event);      //put event into JSON form to be stored in database correctly

            let token = app.getArgument('accesstoken');

            Spotify.setAccessToken(token);

            Spotify.getMe().then(function(userData){
                var username = userData.body.id;
                username = 'spotify:'+username;

                saveEventToDatabase(username,event)  //save the event the particular user is interested in in the database

                app.ask('You have saved ' + event.lineup + ' at ' + event.venue.name + ' to your interested events!');

                getSavedEvents(app);


            }).catch(function(err){
                console.log("Error getting spot user: " + err);
            })



        }
    }



    function findVenueAddress (app) {
        let venue = app.getArgument('venue');

        console.log(venue);

        venueInfoFromTicketMaster(venue).then(function(res){
            let venueData = JSON.parse(res);
            console.log("Venue Data: " + res);

            let addrLine1 = venueData._embedded.venues[0].address.line1;
            let postCode = venueData._embedded.venues[0].postalCode;
            let city = venueData._embedded.venues[0].city.name;

            app.tell("The address of " + venue + " is :" + addrLine1 + ", " + postCode + ", " + city);
        }).catch(function(err){
            console.log('Error occurred getting venue info from Ticketmaster: ' + err);
        })



    }

    //import functions from other files
    const bandsintownFunctions = require('./bandsintownFunctions');
    const skiddleFunctions = require('./skiddleFunctions');
    const presentationFunctions = require('./presentationFunctions');


    function songInfo (app) {
        let artist = app.getArgument('artist');
        let song = app.getArgument('song');

        songInfoFromLastFM(artist,song).then(function(res){


            let songData = JSON.parse(res);

            let songInfo = songData.track.wiki.summary;

            songInfo = songInfo.substring(0, songInfo.indexOf('<')); //remove irrelevant information

            app.tell(songInfo);

        }).catch(function(err){
            console.log('Error occurred getting song info from Last FM: ' + err);
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
        Spotify.resetAccessToken();
        let token = app.getArgument('accesstoken');

        console.log("ACCESS TOKEN INSIDE SPOTIFY ACCESS : " + token);


        Spotify.setAccessToken(token);

        console.log('The access token is ' + Spotify.getAccessToken());

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

                            var artistsCombined = funcs.arrayUnique(artistList.concat(topArtistList));

                            console.log("You artists Combined are : "+ artistsCombined);

                            console.log("Your top artists are : " + topArtistList);


                            //write the username and artists the user likes to database.
                            writeSpotifyUserData(username,artistsCombined);


                            app.ask("The artists you like are :" + artistsCombined);


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


      //  let username = "spotify:" + app.getArgument(SPOTIFY_USERNAME);       //get spotify username of current user

        if(app.getUser().access_token){
            let token = app.getUser().access_token;

            console.log("user is signed in, token is : " + token);

            getOAuthUser(token).then(function(data){
                console.log(data);
                let userData = JSON.parse(data);

                let email = userData.email;

                var username = email.substr(0, email.indexOf('@'));

                username = username.split('.').join("X");

                console.log("Username argument: " + username);

                var spotifyAccessRef = db.ref('spotifyAccessToken/' + username);            //get access token from spotify username in database

                spotifyAccessRef.once("value",snapshot => {     //check if the user has logged into spotify.
                    var accessToken = snapshot.val();
                    if (accessToken){

                        let responseJson = {};      //custom JSON response

                        console.log("ACCESS TOKEN INSIDE SPOTIFY ACCESS : " + accessToken);

                        responseJson.speech = 'Great! You are connected, now what would you like me to do?';    //speech output of response
                        responseJson.displayText = 'Great! you are connected, now what would you like me to do?';   //text output of response
                        var contextStr = '[{"name":"spotify_access", "lifespan":4, "parameters":{"accesstoken": "'+ accessToken + '"}}]';   //context string, setting context to spotify_access and passing the access token as a parameter.
                        var contextObj = JSON.parse(contextStr);    //put string in JSON object.
                        responseJson.contextOut = contextObj;       //put context object in JSON response
                        console.log('Response:'+JSON.stringify(responseJson));
                        response.json(responseJson);        //send JSON response.


                    } else {
                        app.tell("Are you sure you have signed in?");
                    }
                });


            }).catch(function(err){
                console.log("An error occurred :" + err);
            })


        }



    }


    function spotifyLogin(app){

        app.ask(app.buildRichResponse()
            // Create a basic card and add it to the rich response
                .addSimpleResponse('Spotify Login')
                .addBasicCard(app.buildBasicCard('Could you please log into Spotify')
                    .setTitle('Log into Spotify')
                    .addButton('Log In', 'https://eventagent-401c3.firebaseapp.com')
                    .setImage('//logo.clearbit.com/spotify.com', 'Image alternate text')
                    .setImageDisplay('CROPPED')
                )
        );

    }





    // d. build an action map, which maps intent names to functions
    let actionMap = new Map();
    actionMap.set(CHOOSE_CITY_FROM_EVENTS_FOUND_GHOME,chooseCityFromEventsFoundGHOME);
    actionMap.set(CHOOSE_ARTIST_FROM_EVENTS_FOUND_GHOME,chooseArtistFromEventsFoundGHOME);
  //  actionMap.set(SAVE_OR_BARS,saveOrBars);
    actionMap.set(BARS_NEAR_VENUE,barsNearVenue);
    actionMap.set(EVENT_OPTION,eventOption);
    actionMap.set(SAVE_EVENT_O,saveEvent_O);
  //  actionMap.set(BARS_NEAR_VENUE,findBarsNearVenue);
    actionMap.set(DELETE_SAVED_EVENT,deleteSavedEvent);
    actionMap.set(SIGN_IN,signIn);
    actionMap.set(SAVED_EVENTS,getSavedEvents);
    actionMap.set(SAVE_EVENT,saveEvent);
    actionMap.set(VENUE_ADDRESS,findVenueAddress);
    actionMap.set(SONG_INFO,songInfo);
    actionMap.set(FIND_ARTIST_EVENT_USER_LIKES,bandsintownFunctions.findArtistEventUserLikes);
    actionMap.set(FIND_ARTIST_EVENT_BANDSINTOWN_inNextYear,bandsintownFunctions.findArtistEventBandsintownInNextYear);
    actionMap.set(SPOTIFY_SONG_RECOMMENDATION,spotifySongRecommendation);
    actionMap.set(SPOTIFY_ACCESS_ACTION,spotifyAccess);
    actionMap.set(SPOTIFY_LOGGED_IN_ACTION,spotifyLoggedIn);
    actionMap.set(SPOTIFY_LOGIN_ACTION,spotifyLogin);
 //   actionMap.set(FIND_BASIC_EVENTS_ACTION,skiddleFunctions.findBasicEvent);
 //   actionMap.set(FIND_ARTIST,skiddleFunctions.findArtist);


    app.handleRequest(actionMap);
});