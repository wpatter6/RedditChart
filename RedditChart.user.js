// ==UserScript==
// @name         RedditChart
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Some data analysis for reddit
// @author       You
// @match        *://*.reddit.com/*
// @grant        none
// ==/UserScript==

(()=>{
    'use strict';

    var main=()=>{
        var doLog=true,
        aggregates={
            "Post Count":1
            ,"Sum of Votes":2
            //,"Avg Votes/Post":3//uncomment for additional aggregates for those smart enough to be here
            //,"Avg Votes/Post/Minute":4
        },
        log=(a,b)=>{//log shortener
            if(!doLog) return;
            if(typeof(a)==="string") a="RedditChart:" + a;
            else if (!b){b=a; a="RedditChart:debug";}
            if(typeof(b)!=="undefined") return console.log(a,b);
            return console.log(a);
        },
        go=()=>{//method executed once Chart.js has loaded
            if(String(location).indexOf("reddit.com/r/")>-1 && String(location).indexOf("reddit.com/r/all") === -1)
                return log("Inside subreddit. Initialization cancelled.");

            log("Chart.js namespace found.  Initializing...");
            var chart,aggregate=parseInt(localStorage.getItem("rc-agg")||"1"),exclude,
            curpage=execReg(/\/r\/([^\/]*)/,location),
            subpage=(()=>{
                var ret = $("div.menuarea div.dropdown.lightdrop>span").text(),
                    regstr = location.host+"/"+(curpage?"r/"+curpage+"/":"")+"([^/?#]*)";

                if(ret==="") return execReg(regstr,location);
                return execReg(regstr,location) + " " + ret;
            })(),
            //dom element creation
            el=$("<canvas>").addClass("rc-chart").attr({width:"290px",height:"290px",oncontextmenu:"return false;"})
                .mousemove((e)=>{var activePoints=chart.getElementsAtEvent(e.originalEvent),sub=activePoints.length>0?chart.data.labels[activePoints[0]._index]:null; $(".thing").removeClass("rc-active"); if(sub)$(".thing[data-subreddit="+sub+"]").addClass("rc-active");})
				.mouseout(()=>{$(".thing").removeClass("rc-active");})
                .mousedown((e)=>{if(e.button !== 2) return true; var activePoints=chart.getElementsAtEvent(e.originalEvent), sub=activePoints.length > 0 ? chart.data.labels[activePoints[0]._index] :null; exclude=sub; calculate(); return false;}),
            dd=$("<select>").addClass("rc-dd").change((e)=>{localStorage.setItem("rc-agg",aggregate=parseInt($(e.target).val())); calculate();}),
            ddspan=$("<span>").addClass("rc-aggspan").append(dd).append($("<span>").text((()=>{//set the text of which page we're on
                if(subpage.indexOf("user")===0) {
                    var username=execReg("/user/([^/?#]*)",location);
                    if(username) return subpage.replace("user", username);
                }
                return (curpage?"/r/"+curpage:"front page") + " " + subpage;
            })()).css({paddingLeft:"10px"})).css({padding:"10px"}),
            div=$("<div>").addClass("rc-float").appendTo($("body")).append(ddspan).append(el).hover(()=>{ddspan.toggle();}),
            calculate=()=>{//calculate and set up the chart
				log("calculating...");
                var aggregateData=[],namecount={},rawdata=$(".thing:visible").not(".promoted").map((i,e)=>{
                    var diff=(Date.now()-new Date($(e).find("time").attr("datetime")).getTime())/60000,
                        votes=parseInt($(e).find(".score.unvoted").attr("title"));
                    return {
                        sub:$(e).attr("data-subreddit"),
                        votes:votes,
                        vpm:Math.round(votes/diff)};
                }).get();
                for(var i=0; i<rawdata.length; i++){
                    var sub=rawdata[i].sub;
                    if(!sub||sub===exclude) continue;
                    var idx=((d,s)=>{ for(var j=0; j<d.length; j++) if(d[j].sub.toLowerCase()===s) return j; return -1;})(aggregateData,sub.toLowerCase()),
                        curval=idx+1?aggregateData[idx].value:0;
                    switch(aggregate){
                        case 1: curval++; break;
                        case 2:case 3: curval+=rawdata[i].votes; break;
                        case 4: curval+=rawdata[i].vpm; break;
                    }
                    if(idx+1){
                        aggregateData[idx].value=curval;
                        namecount[sub]++;
                    }else{
                        aggregateData.push({sub:rawdata[i].sub,value:curval});
                        namecount[sub]=1;
                    }
                }
                if([3,4].indexOf(aggregate)+1)//averages need to be divided by post count
                    for(var j=0; j<aggregateData.length; j++){
                        var agg=aggregateData[j];
                        agg.value=Math.round(agg.value/namecount[agg.sub]);
                    }

                //sort from biggest to smallest
                aggregateData.sort((a,b)=>{
                    if(b.value-a.value===0) return a.sub.localeCompare(b.sub);
                    return b.value - a.value;
                });
				log("calculating complete.");
                dochart(aggregateData);
                return aggregateData;
            },
            dochart=(data)=>{//take aggregated/sorted data and apply it to the chart & .subreddit elements
				log("charting...");
                var names=[],dataitems=[],colors=getRandomColors(data.length);
                for(var i=0; i<data.length; i++){
                    var agg=data[i];
                    names.push(agg.sub);
                    dataitems.push(agg.value);
                }
                $(".subreddit:visible").each((i,e)=>{
                    var sub =$(e).text().replace("/r/","");
                    if(sub===exclude){$(e).css({backgroundColor:"",color:""});return;}
                    var idx=names.indexOf(sub);if(idx===-1) return;
                    var color=colors[idx],fontColor=getColorLuma(color)<60?"white":"black";
                    $(e).css({backgroundColor:color,color:fontColor});
                });
                if(chart) chart.destroy();
                chart=new Chart(el,{//Chart.js initialize with data
                    type:"pie",
                    data:{
                        labels:names,
                        datasets:[{data:dataitems,backgroundColor:colors,borderColor:colors}]
                    },
                    options:{
                        responsive:false,
                        legend:{display:false},
                        onClick:(e)=>{
                            var activePoints=chart.getElementsAtEvent(e),sub=activePoints[0]?chart.data.labels[activePoints[0]._index]:null;
                            if(!sub) return; open(location.protocol+"//"+location.hostname+"/r/"+sub);
                        }
                    }
                });
                chart.update();
				log("chart complete.");
            };
            //triggered when Never ending reddit fires (RES)
            document.body.addEventListener("DOMNodeInserted",(e)=>{if(e.target.tagName==="DIV" && ($(e.target).attr("id")||"").indexOf("siteTable")>-1)calculate();},true);
            //finish setting up dropdown
            for(var i in aggregates) dd.append($("<option>").text(i).attr("value",aggregates[i]));
            dd.val(aggregate);

            calculate();
            log("Initialization complete.");
        },
        getRandomColors=(c)=>{//get array of random colors, c = length of result array
            var ret=[]; for(var i=0;i<c;i++)ret.push("#000000".replace(/0/g,()=>{return (~~(Math.random()*16)).toString(16);})); return ret;
        },
        getColorLuma=(c)=>{//get color light/darkness
            if(c.indexOf("#")===0)c=c.substring(1); var rgb=parseInt(c,16),r=(rgb >> 16) & 0xff,g=(rgb >>  8) & 0xff,b=(rgb >>  0) & 0xff; return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        },
        checkForChartJs=(c)=>{//recurring setTimeout check to wait for Chart.js to load into page.  Dies after 100 loops.
            if(c<100){ log("Checking for chart.js namespace ("+c+")..."); if(!window.Chart) return setTimeout(checkForChartJs,50,++c); go(); } else log("Chart.js namespace not found! Cannot initialize.");
        },
        execReg=(reg, str)=>{
            if(typeof(reg)==="string") reg = new RegExp(reg); return (reg.exec(str)||[0,null])[1];
        };
        checkForChartJs(0);
   };

    var css=".rc-float{position:fixed;bottom:20px;right:0px; z-index:2000;border-radius:20px;padding:10px;opacity:0.4;text-align:center;} .rc-float:hover{background-color:rgba(0,0,0,0.8);opacity:1} .rc-aggspan{display:none;color:white;font-size:small;} .rc-chart{cursor:pointer;} .subreddit{border-radius:2px;padding:2px;} .rc-active{background-color:rgba(66,66,66,0.3) !important;} .rcf{height:0px;position:fixed;border:0px}";
    $("body")
		.append($("<style>").html(css))
        .append($("<script>").attr({src:"https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.4.0/Chart.min.js"}))
		.append($("<script>").html("("+main.toString()+")();"));
})();