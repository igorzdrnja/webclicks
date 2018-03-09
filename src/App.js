import React, { Component } from 'react';
import * as d3 from 'd3';
import $ from 'jquery';
import './App.css';
import CsvParse from '@vtex/react-csv-parse';
import sort_by from './Sort.js';
import ReactFauxDOM from 'react-faux-dom';
import { Combobox } from 'react-widgets';
import 'react-widgets/dist/css/react-widgets.css';

const websiteIdentifiers = {
    'Amazon': 'www.amazon',
    'Walmart': 'www.walmart'
};
const pageTypeIdentifiers =
    {
        'Amazon': {
            'Category page': ['/b/'],
            'Filter': ['rh=', '/s/'],
            'Product page': ['/dp/'],
            'Deals': ['/deals/']
            //'Other': []
        },
        'Walmart': {
            'Category page': ['/browse/'],
            'Filter': ['/search/', 'facet'],
            'Product page': ['/ip/'],
            'Deals': []
            //'Other': []
        }
    };

const searchIdentifiers =
    {
        'Amazon': ['field-keywords', 'keywords'],
        'Walmart': ['query']
    };

const searchParameterSeparators =
    {
        'Amazon': '+',
        'Walmart': '%20'
    };

const pageTypes = [
    {name:"Category page",color:"#c7f3d8"},
    {name:"Filter",color:"#95d5af"},
    {name:"Product page",color:"#53b67d"},
    {name:"Deals",color:"#398b5c"},
    {name:"Other",color:"#a898b6"}];

class App extends Component {

constructor(props) {
    super(props);
    this.state = {graph: '', keywordsCombo: ''};
}

handleData = data => {
    d3.select("#App").empty();
    this.setState({graph: '', keywordsCombo: ''});

    var me = this;

    var result = [];
    var keywords = [];
    let nodes = [];
    let links = [];
    let interactions = [];
    let average_clicks = 0;
    let average_time = 0;
    let total_loss = 0;
    let max_clicks = 0;
    let step_values_by_identifiers = [];
    let search_parameters_breakdown = { params: [] };

    //we parse the first link from csv to determine the website
    for (let prop in websiteIdentifiers) {
        if (websiteIdentifiers.hasOwnProperty(prop)) {
            let reg = new RegExp(websiteIdentifiers[prop]);
            if (reg.test(data[0].link)) {
                me.website = prop;
                break;
            }
        }
    }

    let page_identifiers = pageTypeIdentifiers[me.website];

    data.sort(sort_by({name:'id', primer: parseInt}, {name:'time', primer: parseInt}));

    let add_interaction_and_result = (value, page, result, interactions) => {
        let obj = {
            'time': value.time,
            'page': page
        };
        if (!result[value.id]) result[value.id] = [];
        result[value.id].push(obj);
        if (!interactions[result[value.id].length - 1]) {
            interactions[result[value.id].length - 1] = { value: 1, loss: 0, step: 'Step ' + result[value.id].length};
        }
        else {
            let lastIndex = result[value.id].length - 1;
            interactions[lastIndex].value++;
        }

        //search queries breakdown
        var parsedUrl = new URL(value.link);
        for (let ident of searchIdentifiers[me.website]) {
            let foundIdent = parsedUrl.searchParams.get(ident);
            if (foundIdent) {
                if (typeof(keywords[value.id]) == 'undefined') keywords[value.id] = [];
                var words = foundIdent.split(' ');
                for (let word of words) {
                       if (!keywords[value.id].includes(word)) {
                           keywords[value.id].push(word);
                           if (typeof(search_parameters_breakdown.params[word]) == 'undefined') search_parameters_breakdown.params[word] = 1;
                           else search_parameters_breakdown.params[word]++;
                       }
                }
            }
        }
    };

    //format result as clicks per user, and get all the interaction steps
    data.forEach((value) => {
        var found = false;
        for (let prop in page_identifiers){
            step_values_by_identifiers[prop] = [];
            if (page_identifiers.hasOwnProperty(prop)) {
                for (let ident of page_identifiers[prop]) {
                    let reg = new RegExp(ident);
                    if (reg.test(value.link)) {
                        add_interaction_and_result(value, prop, result, interactions);
                        found = true;
                        break;
                    }
                };
            }
        }
        if (!found)  {
            add_interaction_and_result(value, 'Other', result, interactions);
        }
    });

    let keywords_breakdown_combo = [];
    for (let word in search_parameters_breakdown.params) {
        keywords_breakdown_combo.push({
            value: "'" + word + "': " + search_parameters_breakdown.params[word] + " Users"
        })
    }

    for (let res in result) {
        if (result[res][result[res].length - 1].page !== 'Product page' && interactions[result[res].length]) {
            interactions[result[res].length].loss++;
            total_loss++;
        }
        average_clicks += result[res].length - 1;
        average_time += parseInt(result[res][result[res].length - 1].time);
        if (max_clicks < result[res].length - 1) max_clicks = result[res].length - 1;
    }

    average_clicks = (average_clicks / Object.keys(result).length);
    average_time = (average_time / Object.keys(result).length);

    //create graph nodes/bars and define all the links / transitions between page types
    for (var i=1; i <= max_clicks + 1; i++) {
        for (var j=0; j < pageTypes.length; ++j) {
            nodes.push({
                "name": pageTypes[j].name,
                "node": nodes.length,
                "color": pageTypes[j].color,
                "step": 'Step ' + i,
                "value": 0,
                "leaving": 0,
                "arriving": 0
            });
            for (var k=0; k < pageTypes.length; k++) {
                if (1 < i && i < max_clicks + 2) { //no need to add links if it's the last step, or if we haven't passed the initial step yet
                    links.push({
                        "source": nodes.length - pageTypes.length - 1,
                        "target": nodes.length  - 1 - j + k,
                        "value": 0
                    });
                }
                for (var r in result) {
                    if (result.hasOwnProperty(r)) {
                        if (1 < i && i < max_clicks + 1) {
                            //check if previous and current page type that user clicked on, match our new links object
                            if ((typeof (result[r][i - 2]) !== 'undefined' && (result[r][i - 2].page === nodes[links[links.length - 1].source].name))
                                && (typeof (result[r][i - 1]) !== 'undefined')
                                //&& (typeof(nodes[links[links.length - 1].target]) !== 'undefined')
                                && (result[r][i - 1].page === nodes[links[links.length - 1].target - pageTypes.length].name)) {
                                links[links.length - 1].value++;
                            }
                        }
                        // if ((typeof (result[r][i - 1]) !== 'undefined'
                        //     && (result[r][i - 1].page === nodes[nodes.length - 1].name)
                        //     && (nodes.length - 1 === pageTypes.length * i  + k - 1))) {
                        //     nodes[nodes.length - 1].value++;
                        //     if (typeof (result[r][i]) === 'undefined') {
                        //         nodes[nodes.length - 1].leaving++;
                        //     }
                        // }
                    }
                }
            }
        }
    }

    me.setState({ clusters_interactions: {'nodes': nodes, 'links': links}, total_interactions: interactions, result_per_user: result, total_users: Object.keys(result).length});

    $("#resultGlobal").html("Total users: " + Object.keys(result).length
                            + "<br/>Total loss: " + total_loss + " (" + (total_loss * 100 / Object.keys(result).length).toFixed(1) + "%)"
                            + "<br/>Average clicks: " + average_clicks.toFixed(2)
                            + "<br/>Average total time spent: " + (average_time/1000).toFixed(2) + " s");

    me.setState({
        keywordsCombo: (
            <span>Keywords used:
                <Combobox
                    data={keywords_breakdown_combo}
                    defaultValue={keywords_breakdown_combo[0]}
                    textField='value'
                    valueField='value'
                    caseSensitive={false}
                    //filter='contains'
                />
            </span>)
    });


    //main functionalities when the data is already formatted properly
    let units = "Users";
    //these are the svg canvas attributes
    let margin = {top: 40, right: 20, bottom: 40, left: 100};
    let width = 1300 - margin.left - margin.right;
    let height = 550 - margin.top - margin.bottom;

    const nodes_distance = Math.floor(width / max_clicks);

    let div = new ReactFauxDOM.createElement('div');

    var svg = d3.select(div).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g") //group everything on the canvas together.
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ") scale(1,-1) translate(" + 0 + "," + -height + ")");

    // svg.append("text")
    //     .text("Users count")
    //     .attr("x",30)
    //     .attr("y",17)
    //     .attr("font-family","Pontano Sans")
    //     .attr("font-size",20)
    //     .attr("fill","black")
    //     .attr("transform", function(d){
    //         return "translate(" + 0 + "," + 50 + ") rotate(-90 150 150)";});

    // svg.append("text")
    //     .text(resultGlobal)
    //     .attr("id","desc")
    //     .attr("class","span3 offset1")
    //     .attr("align","center")
    //     .attr("x",width/2)
    //     .attr("y",10);

    d3.selectAll(".axis").remove();
    // d3.select("#desc").transition().remove();
    // d3.selectAll("#goback").remove();
    // d3.selectAll(".cause").remove();
    // d3.selectAll("#losses").transition().remove();
    // d3.selectAll("#values").transition().remove();
    // d3.selectAll("#months").remove();

    let formatNumber = d3.format(".0f");    // zero decimal places
    let format = function(d) { return formatNumber(d) + " " + units; };
    let colors = d3.schemeCategory20b;

    let axisScale = d3.scaleLinear()
        .domain([this.state.total_users,0])
        .range([0, height]);

    //Create the Axis
    let yAxis = d3.axisLeft()
        .scale(axisScale)
        .ticks(10);

    //mark losses in color according to the total percentage lost within the step
    let lossScale = d3.scaleLinear()
        .domain([0, Object.keys(result).length / 20, Object.keys(result).length])
        .range(["green","orange","red"]);

    // Set the sankey diagram properties
    let sankey = d3.sankey() //calling the function
        .nodeWidth(25)
        .nodePadding(0)
        .size([width, height]);

    var path = sankey.link();

    svg.selectAll("text.values")
        .data(this.state.total_interactions)
        .enter()
        .append("text")
        .text(function(d){
            return formatNumber(d.value)
        })
        .attr("class", "innerText")
        .attr("id", "values")
        .attr("x",function(d,i){
            return i*nodes_distance - margin.left
        })
        .attr("y",20)
        .attr("transform", function(d){
            return "translate(" + margin.left + "," + margin.top + ") scale(1,-1) translate(" + 0 + "," + -((d.value / Object.keys(result).length) * height + 10) + ")";});

    svg.selectAll("text.loss")
        .data(this.state.total_interactions)
        .enter()
        .append("text")
        .text(function(d){
            return d.loss.toString()
        })
        .attr("class", "innerText")
        .attr("id", "losses")
        .attr("x",function(d,i){
            return i*nodes_distance - margin.left
        })
        .attr("y",20)
        .attr("fill",function(d){
            return lossScale(d.loss)
        })
        .attr("transform", function(d){
            return "translate(" + margin.left + "," + margin.top + ") scale(1,-1) translate(" + 0 + "," + -((d.value / Object.keys(result).length) * height - 5) + ")";});

    svg.selectAll("text.interactions")
        .data(this.state.total_interactions)
        .enter()
        .append("text")
        .attr("class", "innerText")
        .attr("id", "clicks")
        .text(function(d){
            return d.step
        })
        .attr("x",function(d,i){
            return i*nodes_distance - margin.left - 12
        })
        .attr("y",20)
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ") scale(1,-1) translate(" + 0 + "," + margin.bottom + ")");

    // load the data
    sankey.nodes(this.state.clusters_interactions.nodes)
        .links(this.state.clusters_interactions.links)
        .layout(0);

    // add in the links
    let link = svg.append("g").selectAll(".link")
        .data(this.state.clusters_interactions.links)
        .enter().append("path")
        .attr("class", "link")
        .attr("d", path)
        .style("stroke-width", function(d) {
            return Math.max(.5, d.dy); //setting the stroke length by the data
        })
        .sort(function(a, b) {
            return b.y - a.y;
        })
        .on("mouseover",linkmouseover)
        .on("mouseout",linkmouseout);

    // add the link titles
    link.append("svg:title") //this is the mouseover stuff title is an svg element you can use "svg:title" or just "title"
        .text(function(d) {
            return d.source.name + " --> " +
                d.target.name + "\n" + format(d.value); });

    // add in the nodes (creating the groups of the rectanlges)
    let node = svg.append("g").selectAll(".node")
        .data(this.state.clusters_interactions.nodes)
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", function(d) {
            return "translate(" + d.x + "," + d.y + ")";
        });

    // add the rectangles for the nodes
    node.append("rect")
        .attr("height", function(d) {
            return d.dy;
        })
        .attr("width", sankey.nodeWidth())
        .style("fill", function(d) { return d.color; }) //matches name with the colors here! inside the replace is some sort of regex
        // .style("stroke",function(d) { return d3.rgb(d.color).darker(1); }) //line around the box formatting
        // .style("stroke-width",.5)
        .on("mouseover", nodemouseover)
        .on("mouseout", nodemouseout)
        //.on("click", onclick)
        .attr("cursor","pointer");

    function nodemouseover(d){

        d3.select(this.component)
            .attr("fill-opacity",.7);

        let desc;
        for(var i=0;i<pageTypes.length;i++){
            if(pageTypes[i].name==d.name){
                desc=pageTypes[i].desc || '';
                var descGlobal = pageTypes[i].desc || '';
            }
        }
        svg.selectAll(".link")
            .filter(function(i){
                return (i.source.node === d.node || i.target.node === d.node);
            })
            .each(function(){
                this.component.style.strokeOpacity = 0.5;
            });

        $("#clustable").html(d.name);
        $("#pcount").html(format(d.value));
        $("#clusdesc").html(desc);
        $("#depart").html(d.leaving + " of these users left before the next click.");
        $("#joined").html(d.arriving + " users switched to this type of page since the last click.");
        // $("#instructions").html("Click on a node to explore the entire history of this users group.");
    }

    function nodemouseout(d){
        d3.select(this.component)
            .attr("fill-opacity",1);

        svg.selectAll(".link")
            .each(function(){
                this.component.style.strokeOpacity = 0.05;
            });

        $("#clustable").html("Mouse over a node to see cluster information");
        $("#pcount").html("");
        $("#clusdesc").html("");
        $("#depart").html("");
        $("#joined").html("");
        $("#instructions").html("");
    }

    function linkmouseover(d){
        this.component.style.strokeOpacity = 0.5;
    }
    function linkmouseout(d){
        this.component.style.strokeOpacity = 0.05;
    }

    //select all of our links and set a new stroke opacity on the condition that the value is 0
    svg.selectAll(".link")
        .style("stroke-opacity", function(d){
            if(d.value === 0) return 0;
        });

    //y axis
    svg.append("g")
        .call(yAxis)
        .attr("class", "axis")
        .attr("transform",
            "translate(" + -25 + "," + 0 + ") scale(1,-1) translate(" + 0 + "," + -(height) + ")");

    //DOM manipulations done, convert to React
    this.setState({graph: (div.toReact())});
};

render(){
    const keys = [
        "id",
        "time",
        "link",
        "empty"
    ];

    return (
            <div className="App">
            <h1 className="App-title">Web Clicks Analyzer</h1>
                <p className="App-intro">
                    <CsvParse
                        keys={keys}
                        separators={[',', ';']}
                        onDataUploaded={
                            this.handleData.bind(this)
                        }
                        render={onChange => <input type="file" onChange={onChange} />}
                    />
                </p>
                <div className="span12" align="center">
                    <p id="resultGlobal" style={{"marginBottom":"20px","marginTop":"15px","marginLeft":"0px"}}></p>
                    <div style={{"width": 300}}>
                        { this.state.keywordsCombo }
                    </div>
                </div>
                <div className="span12" align="center">
                    <div id="App">
                        {  this.state.graph }
                        {/*<img src="assets/graphics/Legend.jpg" style={{"marginTop":"10px"}}></img>*/}
                    </div>
                    {/*<p id="joined" style={{"marginBottom":"-10px","marginTop":"0px","marginLeft":"-800px"}}></p>*/}
                    {/*<p id="depart" style={{"marginBottom":"-15px","marginTop":"-20px","marginLeft":"800px"}}></p>*/}
                    {/*<p id="onclick" style={{"marginBottom":"-10px","marginTop":"20px","marginLeft":"0px"}}></p>*/}
                </div>
                <div className="span12" align="center">
                    <p id="pcount"></p>
                    <p id="clustable" style={{"marginBottom":"20px","marginTop":"15px","marginLeft":"0px"}}></p>
                    <p id="clusdesc" className="span3 offset5" style={{"marginBottom":"300px","marginTop":"15px"}}></p>
                    <p id="instructions" className="span3 offset8" style={{"marginBottom":"300px","marginTop":"45px"}}></p>
                </div>
            </div>
        );
    }
}

export default App;
