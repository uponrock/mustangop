/**
 * Created by cailong on 16/6/7.
 */
'use strict';
var router = require('express').Router();
var AV = require('leanengine');
var util = require('./util');
var https = require('https');

var IOSAppExcLogger = AV.Object.extend('IOSAppExcLogger');

router.get('/', function(req, res) {
    res.render('dailyTask')
});

router.get('/daily', function(req, res){
    var userId = util.useridInReq(req);
    var myDate = new Date();
    var myDateStr = myDate.getFullYear() + '-' + (parseInt(myDate.getMonth())+1) + '-' + myDate.getDate();
    var query = new AV.Query(IOSAppExcLogger);
    query.equalTo('userId', userId);
    query.exists('totalExcCount');
    query.exists('excKinds');
    query.exists('requirementImg');
    query.startsWith('excDateStr', myDateStr);
    query.include('hisAppObject');
    query.find().then(function(results){
        var retApps = new Array();
        for (var i = 0; i< results.length; i++){
            var appHisObject = new Object();
            var appExcHisObject = results[i].get('hisAppObject');
            appHisObject.trackName = appExcHisObject.get('trackName');
            appHisObject.artworkUrl100 = appExcHisObject.get('artworkUrl100');
            appHisObject.artworkUrl512 = appExcHisObject.get('artworkUrl512');
            appHisObject.appleId = appExcHisObject.get('appleId');
            appHisObject.appleKind = appExcHisObject.get('appleKind');
            appHisObject.formattedPrice = appExcHisObject.get('formattedPrice');
            appHisObject.latestReleaseDate = appExcHisObject.get('latestReleaseDate');
            appHisObject.sellerName = appExcHisObject.get('sellerName');

            appHisObject.myAppVersion = results[i].get('myAppVersion');
            appHisObject.hisAppVersion = results[i].get('hisAppVersion');
            appHisObject.excHisDate = results[i].get('excDateStr');
            appHisObject.excKinds = results[i].get('excKinds');
            appHisObject.totalExcCount = results[i].get('totalExcCount');
            if (appHisObject.excKinds == 1){
                appHisObject.excKinds = '评论'
            }else
                appHisObject.excKinds = '下载';

            retApps.push(appHisObject);

        }
        res.json({'myDailyApps':retApps});
    }),function(error){
        res.json({'errorMsg':error.message, 'errorId': error.code});
    }
});

module.exports = router;