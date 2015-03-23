'use strict';

var Log = require('./lib/log.js'),
    secucard = require('./lib/secucard.js'),
    opi = require('./lib/opi.js');


// Config
var config = {
    debug: true,
    client_id: 'f47b1f2306b81870b7873c6349ec945e',
    client_secret: '60fef60734609b5e496538179d8b36e4ca2cb4a8b139d5c4be36be1c7d99875c',
    app_id: 'APP_WC6Z65GJK2Y7N2QQR5GQGR0P9K8YAA',
    host: 'core-dev10.secupay-ag.de',
    stomp_port: 61614,
    stomp_ssl: true,
    stomp_heartbeat: 30, // in seconds
    oauth_path: '/app.core.connector/oauth/token',
    refreshToken: '271331ce99a6506f1fb6d9493977c667eca4af6b',
    deviceserver_port: 20007,
    opidevice_host: '192.168.178.63',
    //opidevice_host: '127.0.0.1',
    opidevice_port: 20002
};


/*
 * Init
 */
var log = new Log(config.debug);

// client for secucard backend
var client = new secucard(config);

// client for dealing with opi device
var opiclient = new opi(config);


/*
 * Setup events (just for getting some info)
 */
client.on("onStompConnected", function() {
    log.info("onStompConnected");
})

client.on("onStompDisconnected", function(error) {
    log.info("onStompDisconnected");
})


/*
 * Start
 */
client.open();
opiclient.startDeviceListener();


// DEMO TEST
/*
setTimeout(function() {
    opiclient.executeCardPayment(1.45, function (result) {
        console.log(result);
    });

}, 10000)
*/


/*
 * Safe exit handler
 */
process.on('SIGINT', function() {
  log.warn("Caught interrupt signal... exiting ...");

  setTimeout(function() {
    client.close();
    process.exit();

  }, 1000)
})
