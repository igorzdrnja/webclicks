import React, { Component } from 'react';
import * as d3 from 'd3';
import * as sk from 'd3-sankey';
import $ from 'jquery';
import './App.css';
import CsvParse from '@vtex/react-csv-parse';
import sort_by from './Sort.js';
import ReactFauxDOM from 'react-faux-dom';
import { Combobox } from 'react-widgets';
import 'react-widgets/dist/css/react-widgets.css';
import  { Col, Row, FormGroup, FormControl, ControlLabel, HelpBlock, Checkbox, }  from 'react-bootstrap';
//import { cat } from './json/amazon_categories.js';
import { CSVLink } from 'react-csv';

const websiteIdentifiers = {
    'Amazon': 'www.amazon',
    'Walmart': 'www.walmart'
};
const pageTypeIdentifiers =
    {
        'Amazon': {
            'Category page': ['/b/', /browse/],
            'Filter': ['rh='],
            'Search': ['/s/'],
            'Product page': ['/dp/'],
            'Deals': ['/deals/']
            //'Other': []
        },
        'Walmart': {
            'Category page': ['/browse/'],
            'Filter': ['facet'],
            'Search': ['/search/'],
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

const filterIdentifiers =
    {
        'Amazon': ['rh'],
        'Walmart': ['facet']
    };

const categoryIdentifiers =
    {
        'Amazon': ['/browse/', '/b/'],
        'Walmart': ['/browse/']
    };

// const searchParameterSeparators =
//     {
//         'Amazon': '+',
//         'Walmart': '%20'
//     };

const pageTypes = [
    {name:"Category page",color:"#c7f3d8"},
    {name:"Filter",color:"#95d5af"},
    {name:"Product page",color:"#53b67d"},
    {name:"Deals",color:"#398b5c"},
    {name:"Other",color:"#a898b6"},
    {name: "Search",color:"#f3bd4e"}];

class App extends Component {

constructor(props) {
    super(props);
    this.handleUrlChange = this.handleUrlChange.bind(this);
    this.getValidationState = this.getValidationState.bind(this);
    this.state = {
        errors: [],
        urlEndPointValue: '',
        graph: '',
        keywordsCombo: '',
        keywordsGroupedCombo: '',
        filtersCombo: '',
        categoryCombo: '',
        positivesCheckboxChecked: false,
        amazonCategories: [], //cat(),
        csvData: [[
            'Keywords used (breakdown per word)',
            'Keywords used (breakdown per user query)',
            'Filters used (breakdown per filter combination)',
            'Categories visited (breakdown per category)',
            'Total users',
            'Total loss',
            'Average clicks',
            'Average total time spent'
        ]],
        csvlinkvisibility: 'hidden'

    };

    //try to import Amazon categories spreadsheet to state

    //the following portable approach is unfortunately very time and memory consuming
    // axios.get('https://cors-anywhere.herokuapp.com/http://d1c723f3ouvz7y.cloudfront.net/US_btg.xlsx', { responseType: 'arraybuffer' })
    //      .then((response) => {
    //          let data = new Uint8Array(response.data);
    //          let workbook = XLSX.read(data, {type:"array"});
    //          let cat = workbook;
    //      });
}

getValidationState = () => {
    let me = this;
    if (me.state.urlEndPointValue.trim().length) {
        let parsedUrls = me.state.urlEndPointValue.split(/[\s\n,]+/);
        parsedUrls.forEach(function(url){
            if (url.length) {
                if (url.trim().length < 5) {
                    me.state.errors = [{value: 'URL is too short!'}];
                    return;
                }
                try {
                    new URL(url);
                }
                catch (e) {
                    me.state.errors.push({value: e.message});
                }
            }
        });
        if (me.state.errors.length) return 'error';
        else return 'success';
    }
};

//the field supports multiple comma separated urls
handleUrlChange = (e) => {
    if (e.target.value.trim().length) {
        this.setState({ urlEndPointValue: e.target.value, errors: [] });
    }
    else e.target.value = '';
};

handleData = data => {
    d3.select("#App").empty();
    this.setState({
        graph: '',
        keywordsCombo: '',
        keywordsGroupedCombo: '',
        filtersCombo: '',
        categoryCombo: '',
        csvData: [[
            'Keywords used (breakdown per word)',
            'Keywords used (breakdown per user query)',
            'Filters used (breakdown per filter combination)',
            'Categories visited (breakdown per category)',
            'Total users',
            'Total loss',
            'Average clicks',
            'Average total time spent'
        ]],
        csvlinkvisibility: 'hidden'
    });

    let me = this;

    let result = [];
    let keywords = [];
    let nodes = [];
    let links = [];
    let interactions = [];
    let average_clicks = 0;
    let average_time = 0;
    let total_loss = 0;
    let max_clicks = 0;
    let search_parameters_breakdown = { params: [] };
    let search_parameters_breakdown_grouped = { params: [] };
    let filter_parameters_breakdown = { params: []};
    let category_parameters_breakdown = { params: []};

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
            'page': page,
            'url': value.link
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
        let parsedUrl = new URL(value.link);
        for (let ident of searchIdentifiers[me.website]) {
            let foundIdent = parsedUrl.searchParams.get(ident);
            if (foundIdent) {
                //remove all the plus signs if they sneak through
                foundIdent = foundIdent.replace(/\+/g, " ");

                //first add it to the grouped search parameters dataset
                if (typeof(search_parameters_breakdown_grouped.params[foundIdent]) === 'undefined') search_parameters_breakdown_grouped.params[foundIdent] = 1;
                else search_parameters_breakdown_grouped.params[foundIdent]++;

                //now add each keyword separately, to another dataset
                if (typeof(keywords[value.id]) === 'undefined') keywords[value.id] = [];
                let words = foundIdent.split(' ');
                for (let word of words) {
                       if (!keywords[value.id].includes(word)) {
                           keywords[value.id].push(word);
                           if (typeof(search_parameters_breakdown.params[word]) === 'undefined') search_parameters_breakdown.params[word] = 1;
                           else search_parameters_breakdown.params[word]++;
                       }
                }
            }

        //parse filtering if it exists and feed it to the filters combo
        for (let identFilter of filterIdentifiers[me.website]) {
            let foundFilter = parsedUrl.searchParams.get(identFilter);
            if (foundFilter) {
                foundFilter = foundFilter.split(',');
                foundFilter.forEach((value) => {
                    if (typeof(filter_parameters_breakdown.params[value]) === 'undefined') filter_parameters_breakdown.params[value] = 1;
                    else filter_parameters_breakdown.params[value]++;
                });
            }
        }

        //parse category id if it exists and feed it to the filters combo
        for (let identCategory of categoryIdentifiers[me.website]) {
            let foundCategory = parsedUrl.pathname.startsWith(identCategory);
            if (foundCategory) {
                if (parsedUrl.searchParams.get('node')) {
                    foundCategory = [parsedUrl.searchParams.get('node')];
                } else {
                    //walmart
                    foundCategory = parsedUrl.pathname.split('/');
                    foundCategory.splice(0, 2);//cut off the /browse/ part
                }
                foundCategory.forEach((value) => {
                    if (value) {
                        if (typeof(category_parameters_breakdown.params[value]) === 'undefined') category_parameters_breakdown.params[value] = 1;
                        else category_parameters_breakdown.params[value]++;
                    }
                });
            }
        }
        }
    };

    // Format result as clicks per user, and get all the interaction steps
    data.forEach((value) => {
        // Did we find/identify the type of page?
        let found = false;
        for (const [key, val] of Object.entries(page_identifiers)) {
            // eslint-disable-next-line
            Object.entries(page_identifiers[key]).every(() => {
                let reg = new RegExp(val);
                if (reg.test(value.link)) {
                    add_interaction_and_result(value, key, result, interactions);
                    found = true;
                    return false;
                }
                return true;
            })
        }
        if (!found)  {
            add_interaction_and_result(value, 'Other', result, interactions);
        }
    });

    let keywords_breakdown_combo = [];
    let keywords_counter = 1;
    for (let word in search_parameters_breakdown.params){
        let val = "'" + word + "': " + search_parameters_breakdown.params[word] + " Users";
        keywords_breakdown_combo.push({
            value: val
        });
        if (typeof (me.state.csvData[keywords_counter]) === 'undefined') me.state.csvData[keywords_counter] = [];
        me.state.csvData[keywords_counter][0] = val;
        keywords_counter++;
    }

    let keywords_grouped_breakdown_combo = [];
    keywords_counter = 1;
    for (let group in search_parameters_breakdown_grouped.params) {
        let val = "'" + group + "': " + search_parameters_breakdown_grouped.params[group] + " Users";
        keywords_grouped_breakdown_combo.push({
            value: val
        });
        if (typeof (me.state.csvData[keywords_counter]) === 'undefined') me.state.csvData[keywords_counter] = [];
        me.state.csvData[keywords_counter][1] = val;
        keywords_counter++;
    }

    let filters_grouped_breakdown_combo = [];
    let filters_counter = 1;
    for (let param in filter_parameters_breakdown.params) {
        let val = param + " - " + filter_parameters_breakdown.params[param] + " Users";
            filters_grouped_breakdown_combo.push({
            value: val
        });
        if (typeof (me.state.csvData[filters_counter]) === 'undefined') me.state.csvData[filters_counter] = [];
        me.state.csvData[filters_counter][2] = val;
        filters_counter++;
    }

    let category_parameters_breakdown_combo = [];
    let categories_counter = 1;
    for (let param in category_parameters_breakdown.params) {
        let val = param + " - " + category_parameters_breakdown.params[param] + " Users";
        if (typeof (me.state.amazonCategories[param]) !== 'undefined') {
            param = me.state.amazonCategories[param];
        }
        category_parameters_breakdown_combo.push({
            value: val
        });
        if (typeof (me.state.csvData[categories_counter]) === 'undefined') me.state.csvData[categories_counter] = [];
        me.state.csvData[categories_counter][3] = val;
        categories_counter++;
    }

    let parsedUrls;
    if (this.state.urlEndPointValue) {
        parsedUrls = me.state.urlEndPointValue.split(/[\s\n,]+/);
    } else {
        parsedUrls = [];
    }

    for (let res in result) {
        //check if the user reached the desired product page
        let success = false;

        for (let idx=0; idx < result[res].length; idx++) {
            if (this.state.urlEndPointValue) {
                // eslint-disable-next-line
                parsedUrls.forEach((url, idx) => {
                    if (url.length) {
                        let urlProcessed = new URL(url);
                        if (result[res][idx].url.substring(0, urlProcessed.href.length) === urlProcessed.href) {
                            success = true;
                        }
                    }
                });
            }
            else if (result[res][idx].page === 'Product page') success = true;
        }
        if (!success) {
            //remove the result entry based on the 'only positives' checkbox
            if (this.state.positivesCheckboxChecked) {
                interactions[result[res].length].value--;
                delete result[res];
            }
            else {
                if (typeof(interactions[result[res].length]) !== 'undefined') interactions[result[res].length].loss++;
                total_loss++;
            }
        }
        if (typeof(result[res]) !== 'undefined') {
            average_clicks += result[res].length;
            // eslint-disable-next-line
            average_time += parseInt(result[res][result[res].length - 1].time);
            if (max_clicks < result[res].length) max_clicks = result[res].length;
        }
    }

    average_clicks = (average_clicks / Object.keys(result).length);
    average_time = (average_time / Object.keys(result).length);

    //create graph nodes/bars and define all the links / transitions between page types
    for (let i=1; i <= max_clicks; i++) {
        for (let j=0; j < pageTypes.length; ++j) {
            //this.state.csvData[0].push('Step ' + i);
            nodes.push({
                "name": pageTypes[j].name,
                "node": nodes.length,
                "color": pageTypes[j].color,
                "step": 'Step ' + i,
                "value": 0,
                "toggledOn": false,
                "leaving": 0,
                "transitionsText": ''
            });
            for (let k=0; k < pageTypes.length; k++) {
                if (1 < i && i < max_clicks + 1) { //no need to add links if it's the last step, or if we haven't passed the initial step yet
                    links.push({
                        "source": nodes.length - pageTypes.length - 1,
                        "target": nodes.length  - 1 - j + k,
                        "value": 0
                    });
                    for (let r in result) {
                        if (result.hasOwnProperty(r)) {
                            if (1 < i && i < result[r].length + 1) {
                                //check if previous and current page type that user clicked on, match our new links object
                                if ((typeof (result[r][i - 2]) !== 'undefined'
                                    && (result[r][i - 2].page === nodes[links[links.length - 1].source].name))
                                    && (typeof (result[r][i - 1]) !== 'undefined')
                                    //&& (typeof(nodes[links[links.length - 1].target]) !== 'undefined')
                                    && (result[r][i - 1].page === nodes[links[links.length - 1].target - pageTypes.length].name)) {
                                    links[links.length - 1].value++;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    me.setState({
        clusters_interactions: {'nodes': nodes, 'links': links},
        total_interactions: interactions,
        result_per_user: result,
        total_users: Object.keys(result).length
    });

    //append data to the csv export property
    me.state.csvData[1].push(...[Object.keys(result).length,
        total_loss + " (" + (total_loss * 100 / Object.keys(result).length).toFixed(1) + "%)",
        average_clicks.toFixed(2),
        (average_time/1000).toFixed(2) + " s"]);


    $("#resultGlobal").html("Total users: " + Object.keys(result).length
                            + "<br/>Total loss: " + total_loss + " (" + (total_loss * 100 / Object.keys(result).length).toFixed(1) + "%)"
                            + "<br/>Average clicks: " + average_clicks.toFixed(2)
                            + "<br/>Average total time spent: " + (average_time/1000).toFixed(2) + " s");

    me.setState({
        filtersCombo: (
            <span>Filters used (breakdown per filter combination):
                <Combobox
                    data={filters_grouped_breakdown_combo}
                    defaultValue={filters_grouped_breakdown_combo[0]}
                    textField='value'
                    valueField='value'
                    caseSensitive={false}
                    style={{"minWidth": 200, "marginBottom": 30, "marginRight": 30}}
                />
            </span>)
    });

    me.setState({
        keywordsCombo: (
            <span>Keywords used (breakdown per word):
                <Combobox
                    data={keywords_breakdown_combo}
                    defaultValue={keywords_breakdown_combo[0]}
                    textField='value'
                    valueField='value'
                    caseSensitive={false}
                    style={{"minWidth": 200, "marginBottom": 30}}
                    //filter='contains'
                />
            </span>)
    });

    me.setState({
        keywordsGroupedCombo: (
            <span>Keywords used (breakdown per user query):
                <Combobox
                    data={keywords_grouped_breakdown_combo}
                    defaultValue={keywords_grouped_breakdown_combo[0]}
                    textField='value'
                    valueField='value'
                    caseSensitive={false}
                    style={{"minWidth": 200, "marginBottom": 30}}
                />
            </span>)
    });

    me.setState({
        categoryCombo: (
            <span>Categories visited (breakdown per category):
                <Combobox
                    data={category_parameters_breakdown_combo}
                    defaultValue={category_parameters_breakdown_combo[0]}
                    textField='value'
                    valueField='value'
                    caseSensitive={false}
                    style={{"minWidth": 200, "marginBottom": 30, "marginRight": 30}}
                />
            </span>)
    });

    //main functionalities when the data is already formatted properly
    let units = "Users";
    //these are the svg canvas attributes
    let margin = {top: 40, right: 20, bottom: 40, left: 100};
    let width = 1300 - margin.left - margin.right;
    let height = 550 - margin.top - margin.bottom;

    let div = new ReactFauxDOM.createElement('div');

    let svg = d3.select(div).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", (height + margin.top + margin.bottom) * 2)
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
    let sankey = sk.sankey() //calling the function
        .nodeWidth(width / max_clicks / 3.5)
        .nodePadding(0)
        .size([width, height]);

    let path = sankey.link();

    const nodes_distance = Math.ceil((width - sankey.nodeWidth())/ (max_clicks - 1));

    svg.selectAll("text.values")
        .data(this.state.total_interactions)
        .enter()
        .append("text")
        .text(function(d){
            return formatNumber(d.value) + ' (' + (d.value * 100 / Object.keys(result).length).toFixed(2) + '%)'
        })
        .attr("class", "innerText")
        .attr("id", "values")
        .attr("x",function(d,i){
            return i*nodes_distance - margin.left +  sankey.nodeWidth()/(max_clicks - 2)
        })
        .attr("y",20)
        .attr("transform", function(d){
            return "translate(" + margin.left + "," + margin.top + ") scale(1,-1) translate(" + 0 + "," + -((d.value / Object.keys(result).length) * height + 10) + ")";});

    svg.selectAll("text.loss")
        .data(this.state.total_interactions)
        .enter()
        .append("text")
        .text(function(d){
            return d.loss.toString() + ' (' + (d.loss * 100 / Object.keys(result).length).toFixed(2) + '%)'
        })
        .attr("class", "innerText")
        .attr("id", "losses")
        .attr("x",function(d,i){
            return i*nodes_distance - margin.left + sankey.nodeWidth()/(max_clicks - 2)
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
            return i*nodes_distance - margin.left - 10 + sankey.nodeWidth()/(max_clicks - 2)
        })
        .attr("y",20)
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ") scale(1,-1) translate(" + 0 + "," + margin.bottom + ")");

    //covering the case in which user made only one click and left
    //(we need to add them to the nodes in the first step because there is no proper sankey link for that case
    //and nodes are generated based on the sankey links)
    let state = Object.assign({}, this.state);
    for (let i=0; i < pageTypes.length; i++) {
        state.clusters_interactions.nodes[i].goneAfterFirstStep = 0;
        for (let r in result) {
            if (result.hasOwnProperty(r) && result[r].length === 1) {
                if (state.clusters_interactions.nodes[i].name === result[r][0].page){
                    state.clusters_interactions.nodes[i].goneAfterFirstStep++;
                }
            }
        }
    }
    this.setState(state);

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
            return Math.min(nodes_distance / 1.75, d.dy); //setting the stroke length by the data
        })
        .style("visibility", function(d) {
            if (d.value) {
                return "visible";
            }
            else {
                return "hidden";
        }})
        .sort(function(a, b) {
            return b.y - a.y;
        })
        .on("mouseover",linkmouseover)
        .on("mouseout",linkmouseout);

    // add the link titles
    link.append("svg:title") //this is the mouseover stuff title is an svg element you can use "svg:title" or just "title"
        .text(function(d) {
            return d.source.name + " --> " +
                d.target.name + "\n" + format(d.value) + ' (' + (d.value * 100 / Object.keys(result).length).toFixed(2) + '%)'; });


    // add in the nodes (creating the groups of the rectangles)
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
        .on("click", nodeonclick)
        .attr("cursor","pointer");

    node.append("text")
        .attr("class", "innerText")
        .attr("style", function(){
            return "font-size: " + Math.floor(750 / max_clicks) + "%;"
        })
        .attr("id", function(d){
            return "transitions" + d.node;
        })
        .attr("x", function(d) {
            return d.x;
        })
        .attr("transform", function(d) {
            return "translate(-" + d.x + ",-" + (d.y + 35) + ") scale(1,-1)";
        });

    $("#clustable").html("Mouse over a node to see cluster information");

    function nodeonclick(d){
        let yOffset = 0;
        let currTrans = null;
        if (!d.toggledOn) {
            if (!d.transitionsText){
                //adding the transitions text for the node
                let el = d3.select("#transitions" + d.node);
                d.sourceLinks.forEach(function (link) {
                    let src = link.source.name.replace(' page','');
                    let trg = link.target.name.replace(' page','');
                    d.transitionsText += src + " --> " +
                        trg + " " + link.value + "\n";
                });

                let words = d.transitionsText.split('\n');

                for (let i = 0; i < words.length; i++) {
                    let tspan = el.append('tspan').text(words[i]);
                    if (i > 0)
                        tspan.attr('x', el.attr('x')).attr('dy', '15');
                }
            }
            d3.select("#transitions" + d.node)
                .style("visibility", "visible");
            //handling the positioning of the transitions breakdown for that stacked bar
            for (let counter = d.node + pageTypes.length - d.node % pageTypes.length - 1; counter > d.node - d.node % pageTypes.length - 1; counter--){
                currTrans = d3.select("#transitions" + counter);
                if (counter <= d.node) {
                    currTrans.transition()
                        .duration(300)
                        .ease(d3.easeLinear)
                        .attr("dy", yOffset);
                }
                if (currTrans.style("visibility") === "visible") {
                    yOffset += currTrans.node().getBBox().height + 4;
                }
            }
            d.toggledOn = true;
        } else {
            d3.select(this.component)
                .attr("fill-opacity",1);
            //handling the positioning of the transitions breakdown for that stacked bar
            yOffset = -(d3.select("#transitions" + d.node).node().getBBox().height + 4);
            for (let counter = d.node + pageTypes.length - d.node % pageTypes.length - 1; counter > d.node - d.node % pageTypes.length - 1; counter--){
                currTrans = d3.select("#transitions" + counter);
                if (counter < d.node) {
                    currTrans.transition()
                        .duration(300)
                        .ease(d3.easeLinear)
                        .attr("dy", yOffset);
                }
                if (currTrans.style("visibility") === "visible") {
                    yOffset += currTrans.node().getBBox().height + 4;
                }
            }
            d3.select("#transitions" + d.node)
                .style("visibility", "hidden");
            d.toggledOn = false;
        }
    }
    function nodemouseover(d){

        d3.select(this.component)
            .attr("fill-opacity",.7);

        let desc;
        for(let i=0;i<pageTypes.length;i++){
            if(pageTypes[i].name===d.name){
                desc=pageTypes[i].desc || '';
            }
        }
        svg.selectAll(".link")
            .filter(function(i){
                return (i.source.node === d.node || i.target.node === d.node);
            })
            .each(function(){
                this.component.style.strokeOpacity = 0.5;
            });

        $("#clustable").html(format(d.value) + ' (' + d.name + ') - ' + (d.value * 100 / Object.keys(result).length).toFixed(2) + '%');
        $("#clusdesc").html(desc);
        $("#depart").html(d.leaving + " of these users left before the next click.");
        $("#joined").html(d.arriving + " users switched to this type of page since the last click.");
        // $("#instructions").html("Click on a node to explore the entire history of this users group.");
    }

    function nodemouseout(d){
        if (!d.toggledOn) {
            d3.select(this.component)
                .attr("fill-opacity", 1);
        }

        svg.selectAll(".link")
            .each(function(){
                this.component.style.strokeOpacity = 0.05;
            });

        $("#clustable").html("Mouse over a node to see cluster information");
        $("#clusdesc").html("");
        $("#depart").html("");
        $("#joined").html("");
        $("#instructions").html("");
    }

    function linkmouseover(){
        this.component.style.strokeOpacity = 0.5;
    }
    function linkmouseout(){
        this.component.style.strokeOpacity = 0.05;
    }

    //select all of our links and set a new stroke opacity on the condition that the value is 0
    // svg.selectAll(".link")
    //     .style("stroke-opacity", function(d){
    //         if(d.value === 0) return 0;
    //     });

    //y axis
    svg.append("g")
        .call(yAxis)
        .attr("class", "axis")
        .attr("transform",
            "translate(" + -25 + "," + 0 + ") scale(1,-1) translate(" + 0 + "," + -(height) + ")");

    //DOM manipulations done, convert to React
    this.setState({graph: (div.toReact())});

    //enable csv export:
    this.setState({csvlinkvisibility: 'visible'
        });
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
                <form style={{ "margin": "30px" }}>
                    <FormGroup
                        align="center"
                        controlId="mainForm"
                        validationState={this.getValidationState()}
                    >
                        <ControlLabel>Enter the goal product url(s):</ControlLabel>
                        <FormControl
                            componentClass="textarea"
                            style={{ minWidth: 500, maxWidth: 500, minHeight: 100, maxHeight: 100 }}
                            value={this.state.urlEndPointValue}
                            placeholder="Enter url"
                            onChange={this.handleUrlChange}
                        />
                        <FormControl.Feedback />
                        <HelpBlock>
                            {
                                (this.state.errors && this.state.errors.length) ?
                                (this.state.errors.map((error, i) => <p key={i}>{error.value}</p>)) :
                                (<p>Leave empty to get results for all products; Validation is based on url parsing.<br/>Urls can be comma, whitespace or newline delimited.</p>)
                            }
                        </HelpBlock>
                        <Row>
                            <Col xs={6} md={6} align="right" style={{marginTop: "8px"}}>
                                <CsvParse
                                    keys={keys}
                                    separators={[',', ';']}
                                    onDataUploaded={
                                        this.handleData.bind(this)
                                    }
                                    render={onChange => <input type="file"
                                                               onChange={onChange}
                                                               disabled={ (this.state.errors && this.state.errors.length) ? "disabled" : ""}
                                                        />}
                                />
                            </Col>
                            <Col xs={6} md={6} align="left">
                                <Checkbox
                                    checked={this.state.positivesCheckboxChecked}
                                    onChange={ (evt) => {
                                        this.setState({ positivesCheckboxChecked: evt.target.checked });
                                    }}
                                > Use only positive results in the analysis
                                </Checkbox>
                            </Col>
                        </Row>
                        <Row>
                            <Col xs={6} md={6} align="center" style={{marginTop: "8px"}}>
                                <CSVLink filename="Results.csv" data={ this.state.csvData } style={{
                                    backgroundColor: '#8dc63f',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    height: 52,
                                    padding: '0 48px',
                                    borderRadius: 5,
                                    color: '#fff',
                                    visibility: this.state.csvlinkvisibility
                                }} >Export results to CSV ⬇</CSVLink>
                            </Col>
                        </Row>
                    </FormGroup>
                </form>
                <Row>
                    <Col xs={4} md={4} align="center">
                        <p id="resultGlobal" style={{"marginBottom":"20px","marginTop":"15px"}} />
                    </Col>
                    <Col xs={4} md={4} align="center">
                        { this.state.keywordsCombo }
                        { this.state.keywordsGroupedCombo }
                    </Col>
                    <Col xs={4} md={4} align="center">
                        { this.state.filtersCombo }
                        { this.state.categoryCombo }
                    </Col>
                </Row>
                <div className="span12" align="center">
                    <p id="clustable" style={{"marginBottom":"20px","marginTop":"15px","marginLeft":"0px"}} />
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
                    <p id="clusdesc" className="span3 offset5" style={{"marginBottom":"300px","marginTop":"15px"}}/>
                    <p id="instructions" className="span3 offset8" style={{"marginBottom":"300px","marginTop":"45px"}}/>
                </div>
            </div>
        );
    }
}

export default App;
