var Twitter = require('twit');
var request = require('request');
var wait = require('wait-promise');

require('dotenv').config();
const Utils = require('./Utils');

var twitter = new Twitter({
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
        console.error('error: ', err);
        //console.log("Unexpected error handling tweet: ", tweet)
    }
});

var watermark = null;
const handleTweet = async (tweet) => {
    const message = tweet.text.replace(/\s*@digevobot\s*/ig, '');
    const directLineClient = await Utils.createClient();
    console.log('---------------------------------> 1');
    const conversacionResponse = await directLineClient.Conversations.Conversations_StartConversation();
    console.log('---------------------------------> 2');
    await sendMessagesFromEndPoint(directLineClient, conversacionResponse.obj.conversationId, message);
    console.log('---------------------------------> 3');

    let activitiesResponse;
    while (!activitiesResponse
        || !activitiesResponse.obj.activities
        || !activitiesResponse.obj.activities.length
        || !activitiesResponse.obj.activities.some(m => m.from.id !== process.env.CLIENT)) {
        activitiesResponse = await directLineClient.Conversations.Conversations_GetActivities(
            { conversationId: conversacionResponse.obj.conversationId, watermark: watermark });
    }
    console.log('---------------------------------> 4');

    watermark = activitiesResponse.obj.watermark;
    respondToTweet(tweet, activitiesResponse.obj.activities);
    console.log('---------------------------------> 5');
}

function respondToTweet(tweet, activities) {
    console.log('---------------------------------> 4.1');
    const status = activities
        .filter(m => m.from.id !== process.env.CLIENT)
        .reduce((acc, a) => acc.concat(getActivityText(a)), '');
    console.log('---------------------------------> 4.2');
    twitter.post('statuses/update',
        { status: status, in_reply_to_status_id: tweet.id_str },
        function (err, data, response) {
            if (err) {
                console.error(err);
            } else {
                console.log(status);
            }
        });
    console.log('---------------------------------> 4.3');
}

function getActivityText(activity) {
    let text = activity.text ? `${activity.text}\n` : '';

    if (activity.attachments) {
        text = activity.attachments
            .filter(att => att.contentType == 'application/vnd.microsoft.card.hero')
            .filter(att => att.content.buttons && att.content.buttons.length)
            .map(att => att.content.buttons)
            .reduce((acc, bs) => acc.concat(bs), [])
            .reduce((acc, b) => acc.concat(`[${b.title}]\n`), text);
    }

    return text;
}

function sendMessagesFromEndPoint(client, conversationId, message) {
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
                        name: process.env.CLIENT
                    }
                }
            }).catch(function (err) {
                console.error('Error sending message:', err);
            });
    }
}
