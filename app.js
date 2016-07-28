'use strict';
var domain = require('domain');
var express = require('express');
var path = require('path');
var ejs = require('ejs');
var fs= require('fs');

var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var busboy = require('connect-busboy');

var cloud = require('./cloud');


var customUtil = require('./routes/util');
// 挂载子路由
var api = require('./routes/api');//for html js api request
var users = require('./routes/users');//user account and info center
var userApps = require('./routes/myApp');//user app related center

var loadHtml = require('./routes/loadHtml');//load static html
var index = require('./routes/index');
var appDetail = require('./routes/appDetail');
var dailyTask = require('./routes/dailyTask');
var taskDetail = require('./routes/taskDetail');
var taskDetailMobile = require('./routes/taskDetailMobApi');
var doTask = require('./routes/doTask');
var taskCheck = require('./routes/taskCheck');
var taskInfor = require('./routes/taskInfor');
var doInnerTask = require('./routes/doInnerTask');
var doOuterTask = require('./routes/doOuterTask');
var alipay = require('./routes/pay');
var myClaim = require('./routes/myClaimApi');
var newtaskMobile = require('./routes/newtaskMobApi');
var interiorExcDetail = require('./routes/interiorExcDetailApi');
var userProtocol=require('./routes/userProtocol');
var handBook=require('./routes/handBook');
var contactUs=require('./routes/contactUs');
var guide=require('./routes/guide');



var app = express();

// 设置 view 引擎
app.set('views', path.join(__dirname, 'views'));
app.engine('.html', ejs.__express);
app.set('view engine', 'html');
app.use(express.static('public'));

// 加载云代码方法
app.use(cloud);

// 使用 LeanEngine 中间件
// （如果没有加载云代码方法请使用此方法，否则会导致部署失败，详细请阅读 LeanEngine 文档。）
// app.use(AV.Cloud);

app.use(busboy());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());

// 未处理异常捕获 middleware
app.use(function(req, res, next) {
  var d = null;
  if (process.domain) {
    d = process.domain;
  } else {
    d = domain.create();
  }
  d.add(req);
  d.add(res);
  d.on('error', function(err) {
    console.error('uncaughtException url=%s, msg=%s', req.url, err.stack || err.message || err);
    if(!res.finished) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=UTF-8');
      res.end('uncaughtException');
    }
  });
  d.run(next);
});

function routeHasPrefix(originalUrl, judgeArray){
  for (var i = 0; i < judgeArray.length; i++){
    var judgeStr = judgeArray[i];
    if (originalUrl.length >= judgeStr.length) {
      var judgePre = originalUrl.substr(0, judgeStr.length);
      if (judgePre == judgeStr) {
        return true;
      }
    }
  }

  return false;
}

// 没有挂载路径的中间件，应用的每个请求都会执行该中间件
app.use(function (req, res, next) {
  //console.log('Time Debug:', Date.now());

  var loginWhiteList  = new Array();
  loginWhiteList[0] = "/user";
  loginWhiteList[1] = "/upload";
  loginWhiteList[2] = "/pay";
  loginWhiteList[3] = "/html";

  loginWhiteList[4] = "/dailyTask";
  loginWhiteList[5] = "/taskDetailMobile";
  loginWhiteList[6] = "/taskDetail";
  loginWhiteList[7] = "/myClaim";

  var needLogin = !routeHasPrefix(req.originalUrl, loginWhiteList);

  //不是主页,也不是以白名单开头的网页,则是需要用户先登陆的网站
  if (req.originalUrl.length > 1 && needLogin){
    //获取cookie的值
    var encodeUserId = req.cookies.userIdCookie;

    //鉴别cookie是否存在
    if ('undefined' === (typeof req.cookies.userIdCookie)){
      res.render('login');
    }else {
      if (encodeUserId.length > 0){
        next();
      }else {
        res.render('login');
      }
    }
  }else {
    next();
  }
});

app.get('/', function(req, res) {
  res.render('index', { currentTime: new Date() });
});

app.post('/upload/img', function(req, resp) {
    customUtil.postFile(req, resp);
});

app.get('/userProtocol', function(req, res) {
  res.render('userProtocol');
});

app.get('/handBook', function(req, res) {
  res.render('handBook');
});

app.get('/contactUs', function(req, res) {
  res.render('contactUs');
});

app.get('/guide', function(req, res) {
  res.render('guide');
});

// 可以将一类的路由单独保存在一个文件中
app.use('/api', api);
app.use('/user', users);
app.use('/myapp', userApps);
app.use('/', index);
app.use('/app', appDetail);
app.use('/dailyTask', dailyTask);
app.use('/taskDetail', taskDetail);
app.use('/taskDetailMobile', taskDetailMobile);
app.use('/doTask', doTask);
app.use('/taskCheck', taskCheck);
app.use('/taskInfor', taskInfor);
app.use('/doInnerTask', doInnerTask);
app.use('/doOuterTask', doOuterTask);
app.use('/pay', alipay);
app.use('/myClaim', myClaim);
app.use('/newtaskMobile', newtaskMobile);
app.use('/interiorExcDetail', interiorExcDetail);
app.use('/userProtocol', userProtocol);
app.use('/handBook', handBook);
app.use('/guide', guide);


//静态html组建
app.use('/html', loadHtml);

// 如果任何路由都没匹配到，则认为 404
// 生成一个异常让后面的 err handler 捕获
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// 如果是开发环境，则将异常堆栈输出到页面，方便开发调试
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) { // jshint ignore:line
    var statusCode = err.status || 500;
    if(statusCode === 500) {
      console.error(err.stack || err);
    }
    res.status(statusCode);
    res.render('error', {
      message: err.message || err,
      error: err
    });
  });
}

// 如果是非开发环境，则页面只输出简单的错误信息
app.use(function(err, req, res, next) { // jshint ignore:line
  res.status(err.status || 500);
  res.render('error', {
    message: err.message || err,
    error: {}
  });
});

module.exports = app;