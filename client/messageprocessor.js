var mdparser = require('./libs/mdparser');
var utils = require('./libs/utils');
var util = require('util'),
colors = require('colors');

var environment = {};

function getnextstep(step) {
    var step = Number(step);
    if (Number.isNaN(step)) {
        step = -1;
    }
    return step + 1;
}

function flattenEnv(env) {
    // Resolve upto 5 levels
    for (var i = 0; i < 5; ++i) {
        var allSymbolsResolved = true;
        for (var property in env) {
            if (typeof (env[property]) == 'string') {
                env[property] = env[property].replace(/\$\((.*?)\)/g, function (match, $1) {
                    return env[$1] || match;
                });
                if (env[property].indexOf("$(") > -1) {
                    allSymbolsResolved = false;
                }
            }
        }
        if (allSymbolsResolved) {
            break;
        }
    }
    return env;
}


function resolveEnv(env) {

    var resolvedEnv = {};
    for (var target in env["$targets"]) {
        for (var property in env) {
            if (property == "$targets") { continue; }
            if (typeof env["$targets"][target][property] == 'undefined') {
                env["$targets"][target][property] = env[property];
            }
        }
        env["$targets"][target][target] = env["$targets"][target]["name"];
        resolvedEnv[target] = flattenEnv(env["$targets"][target]);
    }
    return resolvedEnv;
}

function getEnvId(callbacktopic, jobid, testid) {
    return util.format("%s/%s/%s/%s", callbacktopic, "env", jobid, testid);
}

function process(in_msg, callbacktopic) {
    var msg = in_msg;
    if (typeof (in_msg) == 'string') {
        try {
            msg = JSON.parse(in_msg);
        } catch (error) {
            console.log(error);
            return null;
        }
    }

    var envid = "";
    
    if (msg.testspec) {
        // This is the flow for the test kickoff
        if(msg.step == undefined) {
            console.log(colors.blue("[StartTest     ] ") + msg.testspec);
        }
        else {
            console.log(colors.blue("Invalid message received by controller: (step is defined along with testspec) " + msg));
            return null;
        }
        
        if(typeof  msg.env == 'undefined') {
            console.log(colors.blue("Invalid message received by controller: (env doesn't exist) " + msg));
            return null;            
        }
        if (typeof msg.jobid == 'undefined') {
            msg.jobid = utils.guid();
        };
        if (typeof msg.testid == 'undefined') {
            msg.testid = utils.guid();
        };
        msg.env["testid"] = msg.testid;
        msg.env["jobid"] = msg.jobid;
        envid = getEnvId(callbacktopic, msg.jobid,msg.testid);
        environment[envid] = resolveEnv(msg.env);
        environment[envid+"/testspec"] = msg.testspec;
    }
    else if (msg.testid && msg.jobid) {
            console.log(colors.blue("[ResumeTest    ]" + msg.jobid +"/" +msg.testid));
            envid = getEnvId(callbacktopic, msg.jobid,msg.testid);
            msg.testspec = environment[envid+"/testspec"];
    }
    else {
        console.log("Invalid message received by controller: (jobid and testid are mandatory): " + JSON.stringify(msg))
        return null;
    }
    

    if (msg.exitcode && msg.exitcode != 0) {
        console.log(colors.red("[Exec+Callback]  " + "ERR_EXITCODE" + msg.exitcode));
        return null;
    }

    var nextStep = getnextstep(msg.step);

    //Get next command
    var cmd = mdparser.getcommand(msg.testspec, nextStep, environment[envid]);
    if (cmd) {
        var result =
            {
                msg: {
                    command: cmd.command,
                    callbacktopic: callbacktopic,
                    cwd: cmd.cwd,
                    logfile: cmd.logfile,
                    step: nextStep,
                    jobid: msg.jobid,
                    testid: msg.testid,
                    exitcode: undefined
                },
                target: cmd.target
            };

        if (result.msg.step == 0) {
            result.env = environment[envid];
            result.setenv = true;
        }
        return result;
    }

    return null;
}


module.exports.process = process;
