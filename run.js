'use strict';

var Log = require('./lib/log.js'),
    secucard = require('./lib/secucard.js'),
    opi = require('./lib/opi.js');


// Config
var config = {
    debug: false,
    client_id: 'f47b1f2306b81870b7873c6349ec945e',
    client_secret: '60fef60734609b5e496538179d8b36e4ca2cb4a8b139d5c4be36be1c7d99875c',
    app_id: 'APP_WC6Z65GJK2Y7N2QQR5GQGR0P9K8YAA',
    host: 'connect.secucard.com',
    stomp_port: 61614,
    stomp_ssl: true,
    stomp_heartbeat: 30, // in seconds
    heartbeat_alive_timeout: 70, // in seconds
    oauth_path: '/oauth/token',
    //refreshToken: 'a73227689b2481afb4eebd6cb385ef8021e5c37a',
    refreshToken: '60558a92e50f5fbc359cbed10522db1db954f21b',
    deviceserver_port: 20007,
    opidevice_host: '192.168.1.102',
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
