const ARTIST = 'artist';

var rp = require('request-promise');
const functions = require('firebase-functions');

var funcs = require('./functions.js');


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


exports.findArtistEventUserLikes = function (app) {

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

                        var artistsCombined = funcs.arrayUnique(artistList.concat(topArtistList));



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


};

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