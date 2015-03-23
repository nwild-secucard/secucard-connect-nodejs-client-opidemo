// Includes
var net = require('net'),
    events = require('events'),
    util = require('util'),
    pack = require( "hipack" ),
    Log = require('./log.js');


function OpiDevices(config) {

    events.EventEmitter.call(this);
    this.config = config;

    // Init
    this.log = new Log(config.debug);

    // save context
    _opi = this;
}

// Setup event listener
util.inherits(OpiDevices, events.EventEmitter);


OpiDevices.prototype.startDeviceListener = function() {
    /*
     * Setup events for server socket
     */
     var server = net.createServer(function(c) {

         /*
          * New device connected
          */
         _opi.log.info('server: new device connected');

         // event for disconnect
         c.on('end', function() {
             _opi.log.info('server: device disconnected');
         });

         // event for received data
         var buffer = '';
         c.on('data', function(chunk) {
             _opi.log.info("server: received from device: " + chunk);

             // check length header
             var lenbuf = chunk.slice(0,4);
             var len = pack.unpack("N", lenbuf)[1];

             var payload = chunk.slice(4);
             if (payload.length != len) {
                 _opi.log.error("length header mismatch: header [" + len + "] real [" + payload.length + "]");
                 return false;
             }

             // send device request to backend and result back
             _secucard.sendDeviceRequest(payload.toString(), function (response) {
                 _opi.log.info("Got response to send back");
                 console.dir(response);

                 // add length header
                 var length_header = pack.pack('N', response.data.result.length)
                 var out = Buffer.concat([length_header, new Buffer(response.data.result)]);

                 c.end(out); // send back and close connection
             })

             return true;
         });

     });

    // Start tcp server (listener)
     server.listen(this.config.deviceserver_port, function() {
         _opi.log.info('server: accepting incoming device connections');
     });
}


/*
 * Send Request to opi device and return result
 */
OpiDevices.prototype.sendCommand = function(xml, callback) {
    // prepare data
    this.log.info('SendCommand called (length: ' + xml.length + ')');
    this.log.info(xml);
    var length_header = pack.pack('N', xml.length)
    var out = Buffer.concat([length_header, new Buffer(xml)]);

    // connect
    var device = net.connect({host: this.config.opidevice_host, port: this.config.opidevice_port},
        function() {
            _opi.log.info('connected to device and sending data');
            console.dir(out);
            device.write(out);
        });

    var resData = null;

    device.on('data', function(chunk) {

        if (resData == null) {
            resData = chunk;
        } else {
            resData = Buffer.concat([resData, chunk]);
        }

        var lenbuf = resData.slice(0,4);
        var len = pack.unpack("N", lenbuf);
        len = len[1];

        _opi.log.info("Received data length is: " + len);

        // finished?
        if (resData.length >= len + 4) {
            device.end();
            var out = resData.slice(4);
            callback(out.toString());
        }
    });

    device.on('end', function() {
        _opi.log.info('disconnected from device');
    });

    device.on('error', function() {
        _opi.log.info('error sending data in sendCommand');
    });

}

/*
 * FOR TEST
 */
OpiDevices.prototype.executeLogin = function(callback) {

    var xml = '<?xml version="1.0" encoding="UTF-8" ?>' +
        '<ServiceRequest RequestType="Login" ApplicationSender="ReferenceImplementation" POPID="001" RequestID="1" WorkstationID="" xmlns="http://www.nrf- arts.org/IXRetail/namespace" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '</ServiceRequest>';

    this.sendCommand(xml, callback)
}

OpiDevices.prototype.executeCardPayment = function(amount, callback) {

    var xml = '<?xml version="1.0" encoding="UTF-8" ?>' +
        '<CardServiceRequest RequestType="CardPayment" ApplicationSender="ReferenceImplementation" POPID="001" RequestID="2" WorkstationID="" xmlns="http://www.nrf- arts.org/IXRetail/namespace" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<POSdata>' +
        '<POSTimeStamp>2014-03-19'+ 'T' + '01:33:00</POSTimeStamp>' +
        '</POSdata>' +
        '<TotalAmount Currency="EUR">123</TotalAmount>' +
        '</CardServiceRequest>';

    this.sendCommand(xml, callback)
}



module.exports = OpiDevices;
