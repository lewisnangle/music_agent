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



const ARTIST_ARGUMENT = 'music-artist';
const CITY_ARGUMENT = 'geo-city';


exports.findArtist = function (app){
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

exports.findBasicEvent = function (app) {

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