'use strict';

var Log = require('./lib/log.js'),
    httpclient = require('https');


// Config
var config = {
    debug: false,
    client_id: 'f47b1f2306b81870b7873c6349ec945e',
    client_secret: '60fef60734609b5e496538179d8b36e4ca2cb4a8b139d5c4be36be1c7d99875c',
    host: 'connect.secucard.com',
    oauth_path: '/oauth/token',
    device_uuid: '/vendor/ccv/serial/istdochegal'
};

/*
 * Init
 */
var log = new Log(config.debug);


/*
 * Functions
 */

var getDeviceCode = function(callback) {

    var postData = "grant_type=device&client_id=" + config.client_id + "&client_secret=" + config.client_secret + "&uuid=" + config.device_uuid;

    var options = {
        hostname: config.host,
        path: config.oauth_path,
        method: 'POST', //POST,PUT,DELETE etc
        port: 443,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };

    var authRequest = httpclient.request(options, function (res) {
        // check for HTTP 200 (ok)
        if (res.statusCode == 200) {
            // get it
            res.setEncoding('utf8');
            var resData = null;

            res.on('data', function (chunk) {
                if (resData == null) {
                    resData = chunk;
                } else {
                    resData = Buffer.concat([resData, chunk]);
                }
            });

            res.on('end', function () {
                var token = JSON.parse(resData.toString());
                callback(token);

            });

        } else {
            // error
            log.error("Invalid oauth refresh response: " + res.statusCode);
            // get it
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                console.log(chunk.toString());
            });

        }

    });

    authRequest.write(postData);
    authRequest.end();
}


var getDeviceToken = function(code, callback) {

    var postData = "grant_type=device&client_id=" + config.client_id + "&client_secret=" + config.client_secret + "&code=" + code;

    var options = {
        hostname: config.host,
        path: config.oauth_path,
        method: 'POST', //POST,PUT,DELETE etc
        port: 443,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        }
    };

    var authRequest = httpclient.request(options, function (res) {
        // check for HTTP 200 (ok)
        if (res.statusCode == 200 || res.statusCode == 401) {
            // get it
            res.setEncoding('utf8');
            var resData = null;

            res.on('data', function (chunk) {
                if (resData == null) {
                    resData = chunk;
                } else {
                    resData = Buffer.concat([resData, chunk]);
                }
            });

            res.on('end', function () {
                var token = JSON.parse(resData.toString());
                callback(res.statusCode, token);

            });

        } else {
            // error
            log.error("Invalid oauth response: " + res.statusCode);
            // get it
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                console.log(chunk.toString());
            });

        }

    });

    authRequest.write(postData);
    authRequest.end();
}


/*
 * Start
 */

getDeviceCode(function(data) {
    //console.dir(data);

    // Output info
    log.info("***************** Anzeige Terminal *************");
    log.info("* Seriennummer: " + config.device_uuid);
    log.info("* Code: " + data.user_code);
    log.info("* URL: " + data.verification_url);
    log.info("************************************************");
    log.info("Device-Code to poll: " + data.device_code);


    setInterval(function() {

        getDeviceToken(data.device_code, function(statusCode, token) {
            //console.dir(token);

            // Pending (waiting for user to enter PIN)
            /* TODO: Stop polling when data.expires_in is reached OR ABORT is pressed on Terminal */
            if (statusCode == 401) {
                log.info("pending...")
            }

            if (statusCode == 200) {
                log.info("We got our tokens!")
                log.info("The refresh token is: " + token.refresh_token);
                log.info("Save that token and start normal run operation with it");

                log.info("***************** Anzeige Terminal *************");
                log.info("*                                              *");
                log.info("*      Anmeldung erfolgreich abgeschlossen     *");
                log.info("*                                              *");
                log.info("************************************************");

                process.exit();
            }

        })

    }, data.interval * 1000);
});


/*
 * Safe exit handler
 */
process.on('SIGINT', function() {
  log.warn("Caught interrupt signal... exiting ...");

  setTimeout(function() {
    process.exit();

  }, 1000)
})
