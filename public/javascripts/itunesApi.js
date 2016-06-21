/**
 * Created by wujiangwei on 16/5/9.
 */


var app = angular.module('yemaWebApp', []);

var navIndex = 3;

app.controller('itunesSearchControl', function($scope, $http) {

    //$scope.isError = 0;

    var appsUrl = 'myapp/angular';
    $scope.isLoadingMyApp = true;

    var progressTimerHandle = undefined;
    $scope.progressNum = 0;

    $http.get(appsUrl).success(function(response){
        $scope.isLoadingMyApp = false;
        $scope.myApps = response.myApps;
    });

    $scope.searchApp = function(){
        $scope.isError = 0;

        if ($scope.searchUrl != ''){

            var searchUrl = 'api/itunes/search/' + $scope.searchKey;
            $scope.progressNum = 100;
            //timer
            if (progressTimerHandle != undefined){
                //clearTimeout(progressTimerHandle);
            }

            //progressTimerHandle = setTimeout(timerFunc(), 1);

            console.log('--------- searchApp searchApp');

            $http.get(searchUrl).success(function(response){

                console.log('searchApp' + response);

                $scope.appResults = response.appResults;
                $scope.progressNum = 0;

                if (response.errorMsg.length > 0){
                    $scope.isError = 1;
                    $scope.errorMsg = response.errorMsg;
                }else {
                    $scope.errorMsg = '';
                    if ($scope.appResults.length == 0){
                        $scope.isError = 1;
                        $scope.errorMsg = '未找到你搜索的App,请尝试输入它的全称';
                    }

                    for (var i = 0; i < $scope.appResults.length; i++){
                        var appRe = $scope.appResults[i];

                        appRe.isMine = false;
                        for (var j = 0; j < $scope.myApps.length; j++){
                            var myApp = $scope.myApps[j];
                            if (myApp.appleId === appRe.appleId){
                                appRe.isMine = true;
                                console.log(appRe.appleId + 'isMine');
                                break;
                            }
                        }
                    }
                }
            });
        }
    };

    $scope.keySearchApp = function(e){
        var keycode = window.event?e.keyCode:e.which;
        //console.log('keycode ' + keycode);
        //enter or space
        if(keycode==13 || keycode==32){
            $scope.searchApp();
        }
    };

    $scope.chooseMyApp = function(appInfo){
        //$cookieStore.get("name") == "my name";

        var searchUrl = 'myapp/add';

        console.log(appInfo);
        $http.post(searchUrl, {'appInfo':appInfo}).success(function(response){

            console.log(response.errorId);

            if (response.errorId == 0 || response.errorId === undefined){
                var flag = 0;

                if ($scope.myApps == undefined){
                    $scope.myApps = new Array();
                }

                for (var i = 0; i < $scope.myApps.length; i++){
                    var app = $scope.myApps[i];
                    if (app.appleId == appInfo.appleId){
                        flag = 1;
                        break;
                    }
                }

                if (flag == 0){
                    console.log('add app to ui');
                    //第一个不是最后一个
                    $scope.myApps.push(response.newApp);
                }
                $scope.errorMsg = '';
            }else {
                $scope.errorMsg = response.errorMsg;
            }

            $scope.appResults = [];
        });
    };

    $scope.releaseBtnClick = function(appid){
        $scope.prepareReleaseAppid = appid;

    };

    $scope.releaseMyApp = function(){
        var searchUrl = 'myapp/delete';
        var appid = $scope.prepareReleaseAppid;
        console.log('releaseMyApp' + appid);
        $http.post(searchUrl, {'appid':appid}).success(function(response){
            if (response.errorId == 0){
                console.log('remove app if');
                for (var i = 0; i < $scope.myApps.length; i++){
                    var app = $scope.myApps[i];
                    if (app.appleId == appid){
                        console.log('remove app to ui');
                        $scope.myApps.splice(i, 1);
                        break;
                    }
                }

                $scope.errorMsg = '';
            }else {
                console.log('remove app else');
                $scope.errorMsg = response.errorMsg;
            }

            $scope.appResults = [];
        });
    };

});

//app.directive('itunesSearchDirective', function() {
//    return {
//        restrict: 'AE',
//        template: '<p>Hello {{name}}!</p>',
//        controller: function($scope, $element){
//            $scope.name = $scope.name + "Second ";
//        },
//        link: function(scope, el, attr) {
//            scope.name = scope.name + "Third ";
//        }
//    }
//})