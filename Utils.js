'use strict';

var Swagger = require('swagger-client');
var rp = require('request-promise');

require('dotenv').config();

module.exports = {
    createClient: () => {
        return rp(process.env.SPEC)
            .then(function (spec) {
                return new Swagger({
                    spec: JSON.parse(spec.trim()),
                    usePromise: true
                });
            })
            .then(function (client) {
                client.clientAuthorizations.add('AuthorizationBotConnector',
                    new Swagger.ApiKeyAuthorization('Authorization', 'Bearer ' + process.env.SECRET, 'header'));
                return client;
            })
            .catch(function (err) {
                console.error('Error initializing DirectLine client', err);
            });
    },

    getActivityText: function (activity) {
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
}