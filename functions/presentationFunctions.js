var rp = require('request-promise');
//function to get flickr request
function flickrRequest (keyword){
    return rp('https://api.flickr.com/services/feeds/photos_public.gne?tags=' + keyword +'&format=json');
}




exports.presentAsList = function(eventsToPresent,app,target,type){
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
                        .addSimpleResponse("Ok, Here are the events you're interested in!")
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





                list.push(app.buildOptionItem(event.lineup + " - " + event.venue.name + " on " + event.datetime + ' |'+JSON.stringify(event)+'|')   //We pass the event here
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

                    if (type == 'rememberedEvents'){
                        app.askWithList('Alright, here are your interested events',
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

