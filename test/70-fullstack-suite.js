require("consoleplusplus/console++");
if (typeof define !== 'function') {
  var define = require('amdefine')(module);
}
define(['require'], function (require) {
  var suites = [];

  suites.push({
    name: "full stack tests",
    desc: "tests for the full stack, using the email platform",
    setup: function (env, test) {

      env.mailer = {
        send: this.Stub(function(obj, cb) {
          console.log('MAILER STUB CALLED');
          cb(null, true);
        })
      };
      GLOBAL.mailer = env.mailer;

      env.confirmProps = {
        status: true,
        verb: 'confirm'
      };

      var port = 99550;
      env.client = new this.WebSocketClient({
        url: 'ws://localhost:'+port+'/sockethub',
        type: 'sockethub'
      });

      var config = {};
      config.HOST = {
        ENABLE_TLS: false,
        PORT: port,
        PROTOCOLS: [ 'sockethub' ],
        MY_PLATFORMS: [ 'dispatcher', 'email' ] // list of platforms this instance is responsible for
      };

      listener = require('../lib/protocols/sockethub/listener');
      for (var i = 0, len = config.HOST.MY_PLATFORMS.length; i < len; i = i + 1) {
        if (config.HOST.MY_PLATFORMS[i] === 'dispatcher') {
          continue;
        }
        l  = Object.create(listener);
        l.init(config.HOST.MY_PLATFORMS[i]);
      }

      var dispatcher = require('../lib/protocols/sockethub/dispatcher');

      env.server = {};
      dispatcher.init().then(function() {
        // initialize http server
        env.server.h = require('../lib/httpServer').init(config);
        // initialize websocket server
        env.server.ws = require('../lib/wsServer').init(config, env.server.h, dispatcher);

        console.log(' [*] finished loading' );
        console.log();
        env.client.connect(function(connection) {
          env.connection = connection;
          test.result(true);
        });
      }, function(err) {
        console.log(" [sockethub] dispatcher failed initialization, aborting");
        process.exit();
      });

    },
    takedown: function (env, test) {
      env.connection.close();
      setTimeout(function() {
        //env.server.ws.close();
        env.server.h.close();
        setTimeout(function() {
          test.result(true);
        }, 1000);
      }, 1000);
    },
    tests: [

      {
        desc: "register without remoteStorage",
        run: function (env, test) {
          var data = {
            platform: "dispatcher",
            object: {
              secret: '1234567890'
            },
            verb: "register",
            rid: "123454"
          };
          var expected = {
            status: true,
            rid: "123454",
            verb: 'register',
            platform: "dispatcher"
          };
          env.connection.sendAndVerify(JSON.stringify(data), expected, test, env.confirmProps);
        }
      },

      {
        desc: "attempt send without credentials",
        run: function (env, test) {
          var data = {
            platform: "email",
            actor: {
              address: "user@example.com"
            },
            object: {
              text: 'lalala'
            },
            target: {
              to: [{ address: 'foo@bar.com' }]
            },
            verb: "send",
            rid: "123454"
          };
          var expected = {
            status: false,
            rid: "123454",
            verb: 'send',
            platform: "email",
            message:"could not get credentials"
          };
          env.connection.sendAndVerify(JSON.stringify(data), expected, test, env.confirmProps);
        }
      },

      {
        desc: "set credentials",
        run: function (env, test) {
          var data = {
            platform: "dispatcher",
            target: {
              platform: "email"
            },
            object: {
              credentials: {
                "user@example.com": {
                  smtp: {
                    username: 'user',
                    password: 'secretcode',
                    host: 'example.com'
                  }
                }
              }
            },
            verb: "set",
            rid: "123454"
          };
          var expected = {
            status: true,
            rid: "123454",
            verb: 'set',
            platform: "dispatcher"
          };
          env.connection.sendAndVerify(JSON.stringify(data), expected, test, env.confirmProps);
        }
      },

      {
        desc: "try to send with set credentials",
        run: function (env, test) {
          var data = {
            rid: '002',
            verb: 'send',
            platform: 'email',
            actor: { address: 'user@example.com' },
            object: { subject: 'test email subject', text: 'test email body' },
            target: { to: [{ address: 'user2@example.com.com' }] }
          };

          var expected = {
            status: true,
            rid: "002",
            verb: 'send',
            platform: "email"
          };
          env.connection.sendAndVerify(JSON.stringify(data), expected, test, env.confirmProps);
        }
      },

      {
        desc: "verify mailer was called",
        run: function (env, test) {
          test.assert(env.mailer.send.called, true);
        }
      }


    ]
  });

  return suites;
});