'use strict';

const Twitter = require('twit');
const request = require('request');
const wait = require('wait-promise');
const NodeCache = require('node-cache');
require('dotenv').config();

const cache = new NodeCache({ stdTTL: 1800 });
const Utils = require('./Utils');

const twitter = new Twitter({
    bot_account: process.env.BOT_ACCOUNT,
    consumer_key: process.env.CONSUMER_KEY,
    consumer_secret: process.env.CONSUMER_SECRET,
    access_token: process.env.ACCESS_TOKEN,
    access_token_secret: process.env.ACCESS_TOKEN_SECRET
});

var stream = twitter.stream('statuses/filter', { track: process.env.BOT_ACCOUNT });
stream.on('connect', response => console.log("Opening Twitter streaming connection."));
stream.on("connected", response => console.log("Streaming..."));

stream.on('tweet', tweet => {
    try {
        handleTweet(tweet);
    } catch (err) {
        console.log("Unexpected error handling tweet: ", tweet)
    }
});

var watermark = null;
const handleTweet = async (tweet) => {
    const message = tweet.text.replace(/\s*@digevobot\s*/ig, '');
    const name = tweet.user.name ? tweet.user.name : tweet.user.screen_name;
    const replyID = tweet.in_reply_to_status_id_str;
    const cachedData = replyID ? cache.get(replyID) : undefined;

    let directLineClient;
    let conversationId;
    //todo aquí puedo preguntar solo por cacheData!
    if (!replyID || !cachedData) {
        //si reply y !cacheData, expiró el tiempo o estás respondiendo una conversación que ya finalizó!
        directLineClient = await Utils.createClient();
        const response = await directLineClient.Conversations.Conversations_StartConversation();
        //todo check undefined obj
        conversationId = response.obj.conversationId;
    } else {
        directLineClient = cachedData.client;
        conversationId = cachedData.conversationId;
    }

    await sendMessagesFromEndPoint(directLineClient, conversationId, message, name);

    let activitiesResponse;
    while (!activitiesResponse
        || !activitiesResponse.obj.activities
        || !activitiesResponse.obj.activities.length
        || !activitiesResponse.obj.activities.some(m => m.from.id !== process.env.CLIENT)) {
        activitiesResponse = await directLineClient.Conversations.Conversations_GetActivities(
            { conversationId: conversationId, watermark: watermark });
    }

    watermark = activitiesResponse.obj.watermark;
    respondToTweet(tweet, activitiesResponse.obj.activities, directLineClient, conversationId);
}

function respondToTweet(tweet, activities, client, conversationId) {
    const status = activities
        .filter(m => m.from.id !== process.env.CLIENT)
        .reduce((acc, a) => acc.concat(Utils.getActivityText(a)), '');

    //todo check for final message!
    //todo si el mensaje pasa de 140 caracteres evaluar opciones!
    twitter.post('statuses/update',
        { status: status.substr(0, 140), in_reply_to_status_id: tweet.id_str },
        function (err, data, response) {
            if (err) {
                console.error('An error occurred while sending: ' + err);
            } else {
                console.log(status);
                if (!status.includes('asta la próxima')) {
                    cache.set(data.id_str, { client: client, conversationId: conversationId });
                }else{
                    watermark = null;
                }
            }
        });
}

function sendMessagesFromEndPoint(client, conversationId, message, name) {
    if (message) {
        client.Conversations.Conversations_PostActivity(
            {
                conversationId: conversationId,
                activity: {
                    textFormat: 'plain',
                    text: message,
                    type: 'message',
                    from: {
                        id: process.env.CLIENT,
                        name: name
                    }
                }
            }).catch(function (err) {
                console.error('Error sending message to the bot: ', err);
            });
    }
}
