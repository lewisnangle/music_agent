var rp = require('request-promise');

//function to get flickr request
function flickrRequest (keyword){
    return rp('https://api.flickr.com/services/feeds/photos_public.gne?tags=' + keyword +'&format=json');
}


function ticketMasterInfo(artistAndVenue){
    return rp('https://app.ticketmaster.com/discovery/v2/events.json?keyword='+artistAndVenue+'&apikey=4Y1FGSaYP8LjPAP8oPjLSW1ExUZwCxT5');
}

//present bars found as a list
exports.presentBarsAsList = function(eventsToPresent,app){
    var list = [];

    var events = eventsToPresent;
    var numOfEvents = eventsToPresent.length;


    //if just one event, we need to present basic card to user. Otherwise present them with list.
    if (numOfEvents == 1){

        let event = events[0];

        //flickr request to get photo of venue
        flickrRequest(event.name).then(function(res){
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
                    .addSimpleResponse("Ok, Here is a bar near the venue!")
                    .addBasicCard(app.buildBasicCard(event.name + ' at ' + event.rating,event.formatted_address)
                        .setTitle(event.name + " ---- " + "Rating: " + event.rating + ' at ' + event.formatted_address)
                        .setImage(imageUrl, 'Image alternate text')
                        .setImageDisplay('CROPPED')
                    )
            );


        }).catch(function(err){
            console.log("Error Occurred with Flickr: " + err);
        })

        //more than one event, so we can present the user with a list
    } else if (numOfEvents >= 2) {

        for (let i = 0; i < numOfEvents; i++){
            let event = events[i];

            //flickr request to get photo of venue
            flickrRequest(event.name).then(function(res){
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



                list.push(app.buildOptionItem(event.name + " - " + event.rating + " on " + event.formatted_address + ' |'+JSON.stringify(event)+'|')   //We pass the event here
                    .setTitle(event.name + " ---- " + "Rating: " + event.rating + " on " + event.formatted_address)
                    .setDescription(event.formatted_address)
                    .setImage(imageUrl, 'Artist Events'))


                //once we have created a list containing all events, we present it to the user.
                if (list.length == numOfEvents){

                    app.askWithList('Alright, here are some bars near the venue',
                        // Build a list
                        app.buildList()
                        // Add the first item to the list
                            .addItems(list)
                    );


                }


            }).catch(function(err){
                console.log("Error occurred with Flickr :"+ err);
            });
        }
    } else if (numOfEvents == 0){

        app.tell("I'm sorry, I wasn't able to find any bars near that venue");


    }
}


//present events as list (eventsToPresent = list of event objects, target = the artist or location name from the query, type = 'city' or 'artist')
exports.presentAsList = function(eventsToPresent,app,target,type){
    var list = [];

    var events = eventsToPresent;
    var numOfEvents = eventsToPresent.length;


    //if just one event, we need to present basic card to user. Otherwise present them with list.
    if (numOfEvents == 1){

        let event = events[0];

        //flickr request to get photo of venue
        ticketMasterInfo(event.lineup).then(function(res){

            /**
            //manipulate the Flickr API response so that it is in JSON form
            var data = res.substring(15);
            data = data.slice(0,-1);
            data = JSON.parse(data);
            **/

            var imageUrl;   //get image url of picture of venue

            if (ticketMasterEvent.images[0].url == undefined){
                imageUrl = 'http://oi68.tinypic.com/255mgle.jpg';
            } else {
                imageUrl = ticketMasterEvent.images[0].url;
            }


            if (type == 'artist'){
                app.ask(app.buildRichResponse()
                    // Create a basic card and add it to the rich response
                        .addSimpleResponse('There is just one place ' + target + ' is playing:')
                        .addBasicCard(app.buildBasicCard(event.lineup + ' at ' + event.venue.name,event.description)
                            .setTitle(event.lineup + ' at ' + event.venue.name)
                            .setImage(imageUrl, 'Image alternate text')
                            .setImageDisplay('CROPPED')
                        )
                );
            }

            if (type == 'city'){
                app.ask(app.buildRichResponse()
                    // Create a basic card and add it to the rich response
                        .addSimpleResponse('Ok, here are some events happening in ' + target + ' this year:')
                        .addBasicCard(app.buildBasicCard(event.lineup + ' at ' + event.venue.name,event.description)
                            .setTitle(event.lineup + ' at ' + event.venue.name)
                            .setImage(imageUrl, 'Image alternate text')
                            .setImageDisplay('CROPPED')
                        )
                );
            }

            if (type == 'rememberedEvents'){
                app.ask(app.buildRichResponse()
                    // Create a basic card and add it to the rich response
                        .addSimpleResponse("Ok, Here are the events your saved events:")
                        .addBasicCard(app.buildBasicCard(event.lineup + ' at ' + event.venue.name,event.description)
                            .setTitle(event.lineup + ' at ' + event.venue.name)
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
            ticketMasterInfo(event.lineup).then(function(res){

                console.log("Event : " + event.lineup + "  res " + res);

                let ticketMasterEvent = JSON.parse(res)._embedded.events[0];

                /**
                //manipulate the Flickr API response so that it is in JSON form
                var data = res.substring(15);
                data = data.slice(0,-1);
                data = JSON.parse(data);

                console.log(data);
                **/

                var imageUrl;   //get image url of picture of venue

                //if no image set a default image
                if (ticketMasterEvent.images[0].url == undefined){
                    imageUrl = 'http://oi68.tinypic.com/255mgle.jpg';
                } else {
                    imageUrl = ticketMasterEvent.images[0].url;
                }



                var datetime = event.datetime;
                datetime = datetime.replace("T", ", at ");
                console.log("DateTime :" + datetime);

                list.push(app.buildOptionItem(event.lineup + " - " + event.venue.name + " on " + event.datetime + ' |'+JSON.stringify(event)+'|')   //We pass the event here
                    .setTitle(event.lineup + " - " + event.venue.name + "      " + event.description)
                    .setDescription(datetime)
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

                    if (type == 'rememberedEvents'){
                        app.askWithList('Alright, here are your saved events',
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
            app.ask("I'm sorry, I wasn't able to find any events in that time for " + target);
        }
        if (type == 'city'){
            app.ask("I'm sorry, I wasn't able to find any events you would be interested in within " + target + " in that time");
        }

    }
}

//present as carousel function
exports.presentAsCarousel = function(eventsToPresent,app,target,type){

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
                        .addBasicCard(app.buildBasicCard(event.lineup + ' at ' + event.venue.name,event.description)
                            .setTitle(event.lineup + ' at ' + event.venue.name)
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

                carouselList.push(app.buildOptionItem(event.lineup + " - " + event.venue.name + " on " + event.datetime + ' |'+JSON.stringify(event)+'|') //We pass the event here
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


//old google Home response
exports.getGoogleHomeOutput = function(events,cityOrArtist){
    var eventDict = {};             //dictionary of events, where key is the venue name and value is the act/name of the event
    var numOfEvents = events.length;

    if (cityOrArtist == 'artist'){
        for(let i = 0; i<numOfEvents;i++) {
            eventDict[events[i]['venue']['name']] = events[i]['venue']['city'];      //fill dictionary with venue and event names
        }
    }

    if (cityOrArtist == 'city'){
        for(let i = 0; i<numOfEvents;i++) {
            eventDict[events[i]['lineup']] = events[i]['venue']['name'];      //fill dictionary with lineup and event names
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


