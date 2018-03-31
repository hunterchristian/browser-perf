var Q = require('q'),
	Actions = require('./actions'),
	Metrics = require('./metrics'),
	helpers = require('./helpers');

const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');

var debug = require('debug'),
	log = debug('bp:index'),
	seleniumLog = debug('bp:selenium');

function main(url, cb, cfg) {
	var opts = require('./options').scrub(cfg),
		errors = [],
		results = [];
	var res = [],
		err = [];
	opts.browsers.map(function(browserConfig) {
		return function() {
			return runOnBrowser(url, browserConfig, opts).then(function(data) {
				data._browserName = browserConfig.browserName;
				data._url = url;
				res.push(data);
			}, function(error) {
				if (typeof error === "object" && error.code === 'ECONNREFUSED') {
					error.errno = 'GRID_CONFIG_ERROR';
				}
				err.push(error);
			});
		}
	}).reduce(Q.when, Q()).then(function() {
		cb(err.length === 0 ? undefined : err, res);
	}, function(err) {
		cb(err);
	}).done();
}

const launchChrome = (browserConfig, opts) => {
	const options = new chrome.Options();
	if (browserConfig.chromeOptions && browserConfig.chromeOptions.args) {
		options.addArguments(browserConfig.chromeOptions.args);
	}

	return new Builder()
		.forBrowser('chrome')
		.usingServer(opts.selenium)
		.setChromeOptions(options)
		.build();
}

const launchFirefox = (browserConfig, opts) => {
	const options = new firefox.Options();
	if (browserConfig.firefoxOptions && browserConfig.firefoxOptions.profile) {
		options.setProfile(browserConfig.firefoxOptions.profile);
	}

	return new Builder()
		.forBrowser('firefox')
		.usingServer(opts.selenium)
		.setFirefoxOptions(options)
		.build();
}

function runOnBrowser(url, browserConfig, opts) {
	let browser;
	if (browserConfig.browserName === 'chrome') {
		browser = launchChrome(browserConfig);
	} else if (browserConfig.browserName === 'firefox') {
		browser = launchFirefox(browserConfig);
	} else {
		browser = launchChrome(browserConfig);
	}

	log('Selenium is on %s', browser.noAuthConfigUrl.hostname);

	var metrics = new Metrics(opts.metrics);
	var actions = new Actions(opts.actions);

	return metrics.setup(opts).then(function() {
		return actions.setup(opts);
	}).then(function() {
		log('Stating browser with', JSON.stringify(browserConfig));
		return browser.init(browserConfig);
	}).then(function() {
		log('Session is ' + browser.sessionID);
		log('Running Prescript');
		return opts.preScript(browser);
	}).then(function() {
		if (url) {
			return browser.get(url);
		}
	}).then(function() {
		return metrics.start(browser, browserConfig);
	}).then(function() {
		return actions.perform(browser, browserConfig);
	}).then(function() {
		return metrics.teardown(browser, browserConfig);
	}).then(function() {
		return metrics.getResults();
	}).fin(function() {
		if (!opts.debugBrowser) {
			return browser.quit().catch(function() {
				return Q();
			});
		}
	});
}

module.exports = main;
module.exports.actions = Actions.actions;
module.exports.runner = require('./runner');
module.exports.docs = require('../docs');