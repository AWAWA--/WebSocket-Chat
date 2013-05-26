/**
　* RSS更新チェックBot
 * 使用する場合は、cheerioモジュールを追加すること
 * https://npmjs.org/package/cheerio
 */

var enable = false;
var server = {
	broadcast : function() {}
};
var userData = {
	id : 'RSS_Bot' + new Date().getTime(),
	name : 'RSS_Bot',
	host : '-',
	addr : '-',
	loginDate : new Date().getTime(),
	userAgent : '-'
};

exports.register = function(_server) {
	if (!enable) { return null; }
	server = _server;
	return userData;
};

if (!enable) {
	return;
}

var http = require('http')
	, url = require('url')
	, util = require('util')
	, cheerio = enable ? require('cheerio') : {};

var RSS_ITEMS = [
	{
		title:'Y!ニュース'
		, url:'http://rss.dailynews.yahoo.co.jp/fc/rss.xml'
		// , text: function(item) {
		// 	var title = item.find('title').text().trim();
		// 	var link = item.find('link').text().trim();
		// 	var enclosure = item.find('enclosure');
		// 	if (enclosure.length == 1) {
		// 		return title + ' ' + link + ' ' + enclosure.attr('url').trim();
		// 	} else {
		// 		return title + ' ' + link;			
		// 	}
		// }
		, checkInterval : 30 * 60 * 1000
	},
	{
		title:'地震速報@tenki.jp'
		, url:'http://feed.tenki.jp/component/static_api/rss/earthquake/recent_entries_by_day.xml'
		, filter: function(item) {
			var maxLevel = 0;
			item.children().each(function(index, elem) {
				if (elem.name != 'tenkiJP:earthquake') { return; }
				var maxLevelAttr = $(this).attr('max_level');
				// util.log('maxLevel=' + maxLevelAttr);
				maxLevel = parseInt(maxLevelAttr);
			});
			return maxLevel >= 3;
		}
		// , checkInterval : 1 * 60 * 1000
	},
	{
		title:'地震速報@eew_jp'
		, url:'http://www.twitter-rss.com/user_timeline.php?screen_name=eew_jp'
		// , checkInterval : 1 * 60 * 1000
	}
];

var DEFAULT_CHECK_INTERVAL = 5 * 60 * 1000;

RSS_ITEMS.forEach(function(RSS_ITEM, rssIndex) {

	var rssTitle = RSS_ITEM.title;
	var rssURL = RSS_ITEM.url;
	var rssFilter = (RSS_ITEM.filter != null) ? RSS_ITEM.filter : function(item){
		return true; 
	};
	var rssText = (RSS_ITEM.text != null) ? RSS_ITEM.text : function(item){
		var title = item.find('title').text().trim();
		var link = item.find('link').text().trim();
		return title + ' ' + link;
	};
	var rssCheckInterval = (RSS_ITEM.checkInterval != null) ? RSS_ITEM.checkInterval : DEFAULT_CHECK_INTERVAL;
	var rssCheckDelay = (1*60*1000) + (1*60*1000*rssIndex);

	util.log(rssTitle+' '+rssURL+' '+rssCheckInterval + ' ' + rssCheckDelay);

	var parsedURL = url.parse(rssURL);
	var host = parsedURL.host;
	var port = parsedURL.port;
	var path = parsedURL.path;
	var lastItemPubDate = new Date();
	// var lastItemPubDate = new Date(new Date().getTime()-(3*60*60*1000));

	function getRss() {

		http.get({host: host,　port: port,　path: path,　method: 'GET'}, function(res) {
			// util.log(rssURL + ' : ' + res.statusCode);
			// util.log('HEADERS: ' + JSON.stringify(res.headers));
			res.setEncoding('utf8');
			var data = '';
			res.on('data', function (chunk) {
				data += chunk;
			});
			res.on('end', function () {
				// util.log('data: ' + data);
				try {
					$ = cheerio.load(data, {xmlMode: true});

					var latest = lastItemPubDate;
					var sendMsg = '';
					$('item').each(function(i, elem) {
						var item = $(this);
						var pubDateStr = item.find('pubDate').text();
						// util.log(pubDateStr);
						var pubDate = new Date(Date.parse(pubDateStr));
						if (lastItemPubDate.getTime() < pubDate.getTime() && rssFilter(item) == true) {
							var msg = rssText(item);
							// util.log(msg);
							if (sendMsg != '') { sendMsg += '\n'; }
							sendMsg += msg;
							if (latest.getTime() < pubDate.getTime()) {
								latest = pubDate;
							}
						}
					});
					// util.log('lastItemPubDate: ' + lastItemPubDate);
					// util.log('latest: ' + latest);
					lastItemPubDate = latest;
					if (sendMsg != '') {
						server.broadcast({
							'msgTarget' : null,
							'isPrivate' : false,
							'time' : new Date().getTime(),
							'id' : userData.id,
							'name' : userData.name + '('+rssTitle+')',
							'host' : host,
							'addr' : userData.addr,
							'effect' : 0,
							'msg' : sendMsg
						});
					}
				} catch (e) { util.log('ERROR: '+rssTitle+' '+e); }

				setTimeout(getRss, rssCheckInterval);
			});
		}).on('error', function(e) {
			util.log('GET ERROR: '+rssTitle+' '+e);
			setTimeout(getRss, rssCheckInterval);
		});

	};

	setTimeout(getRss, rssCheckDelay);
});

