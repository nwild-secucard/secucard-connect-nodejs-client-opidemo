// Includes
var events = require('events'),
    util = require('util'),
    Log = require('./log.js'),
    httpclient = require('https'),
    stomplib = require('./stomp/stomp.js');


function SecucardClient(config) {

    events.EventEmitter.call(this);
    this.config = config;

    // Init
    this.log = new Log(config.debug);
    this.correlationIds = [];

    this.opened = false;
    this.connected = false;
    this.heartbeatTimer = null;
    this.tokenData = null;
    this.accessToken = null;

    // Init stomp client
    this.stomp = new stomplib.Stomp({
        port: this.config.stomp_port,
        host: this.config.host,
        ssl: this.config.stomp_ssl,
        debug: this.config.debug,
        login: this.accessToken,
        passcode: this.accessToken,
        heart_beat: (this.config.stomp_heartbeat+10) * 1000 + ',0'
    });

    /*
     * register event for connect
     */
    this.stomp.on('connected', function() {
        _secucard.connected = true;
        // throw event
        _secucard.emit('onStompConnected', this);

        // Send heartbeat
        _secucard.sendHeartbeat();

    });

    /*
     * register event for disconnect
     */
    this.stomp.on('disconnected', function() {
        _secucard.connected = false;
        _secucard.emit('onStompDisconnected', this);

        // check if we are opened and should reconnect
        if (_secucard.opened) {
            _secucard.handleError();
        }
    });

    /*
     * register event to received stomp frames
     */
    this.stomp.on('message', function(frame){
        _secucard.handleStompMessage(frame);
    } );

    /*
     * register event for stomp errors
     */
    this.stomp.on('error', function() {
        _secucard.stomp.disconnect();
    });

    /*
     * register event to handle backend actions
     */
    this.on('onBackendAction', function(frameBody){
        _secucard.handleBackendAction(frameBody);
    } );

    /*
     * Setup heartbeat timer (and monitoring of token expiration)
     */
    this.heartbeatTimer = setInterval(function() {

        // check if connected
        if (!_secucard.connected) {
            return false;
        }

        // Send heartbeat
        _secucard.sendHeartbeat();

        // Check if used token expires and refresh/reconnect before
        if ((_secucard.tokenData.fetched_at +_secucard.tokenData.expires_in - 60) < (new Date().getTime() / 1000)) {
            // refresh token 60 seconds before it expires
            /* TODO: In real life: Do that 180 seconds before to have enough time to wait for running OPI transactions to finish*/
            // here we just close the stomp connection, because then normal refresh/reconnect handler solves everything
            _secucard.log.warn("accessToken is about to expire => disconnect to force refresh/reconnect");
            _secucard.stomp.disconnect();
        }


    }, this.config.stomp_heartbeat * 1000);


    // save context
    _secucard = this;
}

// Setup event listener
util.inherits(SecucardClient, events.EventEmitter);


/*
 * Open client (and stomp connection)
 */
SecucardClient.prototype.open = function() {

    if (this.connected) {
        this.log.error("already connected client");
    }

    // Remeber that we should stay open now
    this.opened = true;

    // Force token refresh before every connect attempt
    this.refreshToken(function(token) {
        _secucard.log.info('Token refresh successfull. New accessToken: ' + token.access_token);
        // save token
        _secucard.tokenData = token;
        _secucard.accessToken = token.access_token;

        // update stomp credentials
        _secucard.stomp.login = _secucard.accessToken;
        _secucard.stomp.passcode = _secucard.accessToken;

        // Connect to stomp server
        _secucard.stomp.connect();
    });
};

/*
 * Close client (and stomp connection)
 */
SecucardClient.prototype.close = function() {
    // Remeber that we should stay open now
    _secucard.opened = false;

    // Disconnect
    this.stomp.disconnect();
};


/*
 * Send heartbeat
 */
SecucardClient.prototype.sendHeartbeat = function() {
    _secucard.log.info("Heartbeat: PING");

    // execite session refresh with refreshInterval 10 seconds longer than we plan to send our heartbeat
    _secucard.rpcStomp('sessionsRefresh', {
        refreshInterval: _secucard.config.stomp_heartbeat + 10
    }, function(ret) {
        _secucard.log.info('Heartbeat: PONG');
    });
};


/*
 * Send actions result
 */
SecucardClient.prototype.sendActionsResult = function(id, data, callback) {
    _secucard.log.info("Actions Result: id [" + id +"]");
    data.id = id;

    // execite session refresh with refreshInterval 10 seconds longer than we plan to send our heartbeat
    _secucard.rpcStomp('opiHandleServiceResult', data, function(ret) {
        _secucard.log.info('Actions Result: Got Response');
        console.dir(ret);
        if (callback) {
            callback(ret);
        }
    });
};


/*
 * Send actions result
 */
SecucardClient.prototype.sendDeviceRequest = function(requestXml, callback) {
    _secucard.log.info("sendDeviceRequest");

    // execite session refresh with refreshInterval 10 seconds longer than we plan to send our heartbeat
    var data = { xml: requestXml };
    _secucard.rpcStomp('opiHandleDeviceRequest', data, function(ret) {
        _secucard.log.info('opiHandleDeviceRequest: Got Response');
        console.dir(ret);
        if (callback) {
            callback(ret);
        }
    });
};

/*
 * Send Raw Stomp message
 */
SecucardClient.prototype.rpcStomp = function(method, data, callback) {
    /*
     * Generate random correlation id and store it in array (to match response to it later)
     */
    var correlationId = this.sendStompRaw(method, data, true);
    _secucard.correlationIds.push({
        id: correlationId,
        call_function: callback
    });
}



/*
 * Send Raw Stomp message
 */
SecucardClient.prototype.sendStompRaw = function(method, data, request_response) {
    // build frame
    dest = '/exchange/connect.api/app:' + method;

    var frame = {
        destination: dest,
        body: JSON.stringify(data)
    };

    // add extra
    var correlationId = true;
    frame['user-id'] = this.accessToken;
    frame['app-id'] = this.config.app_id;

    if (request_response) {
        correlationId = new Date().getTime() + "/" + Math.floor(Math.random() * 10000000);
        frame['reply-to'] = '/temp-queue/main';
        frame['correlation-id'] = correlationId;
    }

    _secucard.stomp.send(frame, false);

    return correlationId;
}

/*
 * Handle received Stomp messages
 */
SecucardClient.prototype.handleStompMessage = function(frame) {
    _secucard.log.debug('handleStompMessage');
    /*
     * Check if message is a RPC-Response
     *
     * Find correlation-id in array and call registered callback function for it
     */
    if (frame.command == 'MESSAGE') {
        // parse json body
        if (frame.headers['content-type'] == 'application/x-json') {
            frame.body = JSON.parse(frame.body);
        }

        // We assume that every message with a correlation-id is a response to a request we sent
        if (frame.headers['correlation-id']) {
            // loop through array of sent messages and find matching request
            var arrayLength = _secucard.correlationIds.length;
            for (var i = 0; i < arrayLength; i++) {
                if (_secucard.correlationIds[i].id == frame.headers['correlation-id']) {
                    // Found! Call registered callback function for that request
                    _secucard.log.debug("found registered callback for correlation-id");
                    _secucard.correlationIds[i].call_function(frame.body);
                    return true;
                }
            }
        } else {
            // Looks like a new message/action/event from the backend
            _secucard.log.debug("message has no correlation-id, so emit event onBackendAction");
            _secucard.emit('onBackendAction', frame.body);

            return true;
        }
    }

    // we dont know what that, so we dont handle it
    return false;
}




/*
 * Do OAUTH token refresh
 *
 * Background information:
 * - This should be done BEFORE ANY connection attempts (event before reconnects after connection aborts)
 * - This should be done when "expire" timeout of obtained accessToken is reached (and then reconnect with new token)
 */
SecucardClient.prototype.refreshToken = function(callback) {

    var postData = "grant_type=refresh_token&client_id=" + _secucard.config.client_id + "&client_secret=" + _secucard.config.client_secret + "&refresh_token=" + _secucard.config.refreshToken;

    var options = {
        hostname: _secucard.config.host,
        path: _secucard.config.oauth_path,
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
                token = JSON.parse(resData.toString());
                // save fetch time to token (to handle expiration)
                token.fetched_at = new Date().getTime() / 1000; // save unixtimestamp when token was refreshed in seconds
                // OVERWRITE EXPIRES TO 120 SECONDS FOR HARDER/FASTER TEST
                //token.expires_in = 120;

                _secucard.emit('onTokenRefreshed', token);
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

    authRequest.on('error', function() {
        _secucard.handleError();
    });

    authRequest.write(postData);
    authRequest.end();
}


/*
 * function to handle errors (retry)
 */
SecucardClient.prototype.handleError = function() {

    this.log.warn("handleError called... wait and retry...");

    // wait 3 seconds to retry
    setTimeout(function() {
        _secucard.open();
    }, 3000);

    return true;
}

/*
 * function to handle backend actions
 */
SecucardClient.prototype.handleBackendAction = function(frameBody) {

    this.log.info("handleBackendAction called");

    console.dir(frameBody);

    // Is that an opi message for the terminal?
    if (frameBody.target == "opi") {
        _opi.sendCommand(frameBody.data.xml, function(resultXml) {
            _secucard.log.info("GOT OPI RESULT: " + resultXml);
            _secucard.sendActionsResult(frameBody.id, {xml: resultXml, xmlb64: new Buffer(resultXml).toString('base64') });
        });
    }

    return true;
}



module.exports = SecucardClient;
