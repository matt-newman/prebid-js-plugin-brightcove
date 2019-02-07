/**
 * DFP Url Generator module.
 * @module DfpUrlGenerator
 */

var _logger = require('./Logging.js');
var _prefix = 'PrebidVast->DfpUrlGenerator';

var dfpUrlGenerator = function () {
	/** Safe defaults which work on pretty much all video calls. */
	var defaultParamConstants = {
		env: 'vp',
		gdfp_req: 1,
		output: 'xml_vast3',
		unviewed_position_start: 1,
	};

	function formatQS(query) {
		return Object
		  .keys(query)
		  .map(function(k) {
			  if (Array.isArray(query[k])) {
				return query[k].map(function(v) {
					return k + '[]=' + v;
				  }).join('&');
			  }
			  else {
				return k + '=' + query[k];
			  }
			})
		  .join('&');
	}

	function deepAccess(obj, path) {
		if (!obj) {
		  return;
		}
		path = String(path).split('.');
		for (var i = 0; i < path.length; i++) {
		  obj = obj[path[i]];
		  if (typeof obj === 'undefined') {
			return;
		  }
		}
		return obj;
	}

	function buildUrl(obj) {
		return (obj.protocol || 'http') + '://' +
			   (obj.host ||
				obj.hostname + (obj.port ? ':${obj.port}' : '')) +
			   (obj.pathname || '') +
			   (obj.search ? '?${' + formatQS(obj.search || '') + '}' : '') +
			   (obj.hash ? '#${obj.hash}' : '');
	}

	function parseSizesInput(sizeObj) {
		var parsedSizes = [];

		// if a string for now we can assume it is a single size, like "300x250"
		if (typeof sizeObj === 'string') {
		  // multiple sizes will be comma-separated
		  var sizes = sizeObj.split(',');

		  // regular expression to match strigns like 300x250
		  // start of line, at least 1 number, an "x" , then at least 1 number, and the then end of the line
		  var sizeRegex = /^(\d)+x(\d)+$/i;
		  if (sizes) {
			for (var curSizePos in sizes) {
			  if (hasOwn(sizes, curSizePos) && sizes[curSizePos].match(sizeRegex)) {
				parsedSizes.push(sizes[curSizePos]);
			  }
			}
		  }
		} 
		else if (typeof sizeObj === 'object') {
		  var sizeArrayLength = sizeObj.length;

		  // don't process empty array
		  if (sizeArrayLength > 0) {
			// if we are a 2 item array of 2 numbers, we must be a SingleSize array
			if (sizeArrayLength === 2 && typeof sizeObj[0] === 'number' && typeof sizeObj[1] === 'number') {
			  parsedSizes.push(parseGPTSingleSizeArray(sizeObj));
			}
			else {
			  // otherwise, we must be a MultiSize array
			  for (var i = 0; i < sizeArrayLength; i++) {
				parsedSizes.push(parseGPTSingleSizeArray(sizeObj[i]));
			  }
			}
		  }
		}

		return parsedSizes;
	}

    function parseQS(query) {
		return !query ? {} : query
		  .replace(/^\?/, '')
		  .split('&')
		  .reduce((acc, criteria) => {
				var arr = criteria.split('=');
				var k = arr[0];
				var v = arr[1];
				if (/\[\]$/.test(k)) {
					k = k.replace('[]', '');
					acc[k] = acc[k] || [];
					acc[k].push(v);
				}
				else {
					acc[k] = v || '';
				}
				return acc;
			}, {});
	}

	function parse(url, options) {
		var parsed = document.createElement('a');
		if (options && 'noDecodeWholeURL' in options && options.noDecodeWholeURL) {
		  parsed.href = url;
		} else {
		  parsed.href = decodeURIComponent(url);
		}
		// in window.location 'search' is string, not object
		var qsAsString = (options && 'decodeSearchAsString' in options && options.decodeSearchAsString);
		return {
		  href: parsed.href,
		  protocol: (parsed.protocol || '').replace(/:$/, ''),
		  hostname: parsed.hostname,
		  port: +parsed.port,
		  pathname: parsed.pathname.replace(/^(?!\/)/, '/'),
		  search: (qsAsString) ? parsed.search : parseQS(parsed.search || ''),
		  hash: (parsed.hash || '').replace(/^#/, ''),
		  host: parsed.host || window.location.host
		};
	}

	function getCustParams(bid, options) {
		var adserverTargeting = (bid && bid.adserverTargeting) || {};

		var allTargetingData = {};

		const optCustParams = deepAccess(options, 'params.cust_params');
		let customParams = Object.assign({},
		  allTargetingData,
		  adserverTargeting,
		  { hb_uuid: bid && bid.videoCacheKey },
		  // hb_uuid will be deprecated and replaced by hb_cache_id
		  { hb_cache_id: bid && bid.videoCacheKey },
		  optCustParams,
		);
		return encodeURIComponent(formatQS(customParams));
	}

	function getDescriptionUrl(bid, components, prop) {
		if (!deepAccess(components, '${prop}.description_url')) {
			var vastUrl = bid && bid.vastUrl;
			if (vastUrl) {
				return encodeURIComponent(vastUrl); 
			}
		}
		else {
			_logger.log(_prefix, 'nput cannnot contain description_url');
		}
	}

	function buildUrlFromAdserverUrlComponents(components, bid, options) {
		var descriptionUrl = getDescriptionUrl(bid, components, 'search');
		if (descriptionUrl) {
			components.search.description_url = descriptionUrl;
		}

		var encodedCustomParams = getCustParams(bid, options);
		components.search.cust_params = (components.search.cust_params) ? components.search.cust_params + '%26' + encodedCustomParams : encodedCustomParams;

		return buildUrl(components);
	}

	this.buildVideoUrl = function (dfpOpts, sizes) {
		var options = dfpOpts;
		if (!options.params && !options.url) {
			_logger.log(_prefix, 'A params object or a url is required to use dfpUrlGenerator.buildVideoUrl');
			return null;
		}

		var bid = options.bid;
		var urlComponents = {};

		if (options.url) {
			// when both 'url' and 'params' are given, parsed url will be overwriten
			// with any matching param components
			urlComponents = parse(options.url, {noDecodeWholeURL: true});

			if (isEmpty(options.params)) {
				return buildUrlFromAdserverUrlComponents(urlComponents, bid, options);
			}
		}

		var derivedParams = {
			correlator: Date.now(),
			sz: parseSizesInput(sizes).join('|'),
			url: encodeURIComponent(location.href),
		};
		var encodedCustomParams = getCustParams(bid, options);

		var queryParams = Object.assign({},
			defaultParamConstants,
			urlComponents.search,
			derivedParams,
			options.params,
			{ cust_params: encodedCustomParams }
		);

		var descriptionUrl = getDescriptionUrl(bid, options, 'params');
		if (descriptionUrl) {
			queryParams.description_url = descriptionUrl; 
		}

		return buildUrl({
			protocol: 'https',
			host: 'pubads.g.doubleclick.net',
			pathname: '/gampad/ads',
			search: queryParams
		});
	};

    // @exclude
    // Method exposed only for unit Testing Purpose
    // Gets stripped off in the actual build artifact
	this.test = function() {
		return {
		};
	};
	// @endexclude
};

module.exports = dfpUrlGenerator;
