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





function writeUserData(name,musicGenres,artists) {
    var userRef = db.ref('users/');

    userRef.child(name).set({
        username:name,
        genres: musicGenres,
        artists: artists
    })

}




function checkExists (user) {
    var userRef = db.ref('users/');
    userRef.orderByChild("username").equalTo(user).once("value",snapshot => {
        const userData = snapshot.val();
        if (userData){
            console.log("EXISTS ALREADY.");
        } else {
            console.log("DOESNT EXIST GO ON");
        }
    });
}





//Dialogflow----------------------------------------------------------------------------------------------------


process.env.DEBUG = 'actions-on-google:*';
const App = require('actions-on-google').DialogflowApp;


// a. the action name from the Dialogflow intent
const FIND_BASIC_EVENTS_ACTION = 'find_basic_events';
const FIND_ARTIST = 'find_artist';
const WELCOME_FIRST_TIME_ACTION = 'Welcome.Welcome-no';

// b. the parameters that are parsed from the make_name intent
const ARTIST_ARGUMENT = 'music-artist';
const CITY_ARGUMENT = 'geo-city';
const USERNAME_ARGUMENT = 'users-name';
const MUSIC_GENRES_ARGUMENT = 'music-genres';
const MUSIC_ARTISTS_ARGUMENT = 'music-artists';


exports.MusicPlayer = functions.https.onRequest((request, response) => {
const app = new App({request, response});



console.log('Request headers: ' + JSON.stringify(request.headers));
console.log('Request body: ' + JSON.stringify(request.body));

//------------------------------------------------------------Events and geocoding------------------------------
var NodeGeocoder = require('node-geocoder');            //require node-geocoder for converting location names into coordinates
var request = require('request');             //require the request module for calling the Skiddle API.
var skiddleKey = '7b8ab215e66d06e23c5f8b6a691de015';
var geoCodeKey = 'AIzaSyDHtzdPWL_4k-NFqrzV3LPA0DS1kxravII'




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


//--------------------------------------------------------------------------------------------------------------------------


// c. The functions


  function welcomeFirstTime (app) {
      let name = app.getArgument(USERNAME_ARGUMENT);        //get name of user
      let genres = app.getArgument(MUSIC_GENRES_ARGUMENT);           //get music genres user likes
      let artists = app.getArgument(MUSIC_ARTISTS_ARGUMENT);

      checkExists(name);



      writeUserData(name,genres,artists);

      app.tell('You wont be forgotten ' + name + ". \xa0" + "The genres you like are : " + genres + " The artists you like are: " + artists );

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
  actionMap.set(WELCOME_FIRST_TIME_ACTION,welcomeFirstTime);
  actionMap.set(FIND_BASIC_EVENTS_ACTION,findBasicEvent);
  actionMap.set(FIND_ARTIST,findArtist);


app.handleRequest(actionMap);
});









