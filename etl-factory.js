"use strict";
var _ = require('underscore');
//Report Indicators Json Schema Path
var indicatorsSchema = require('./reports/indicators.json');
var hivSummaryReport = require('./reports/hiv-summary-report.json');
var reports=[];

//create an array of reports --->push your report using reports.push(report1,report2,... report(n));
reports.push(hivSummaryReport);
//etl-factory builds and generates queries dynamically in a generic way using indicator-schema and report-schema json files
module.exports = function() {
    return {
       buildPatientListExpression:buildPatientListExpression,
       buildIndicatorsSchema:buildIndicatorsSchema,
       singleReportToSql :singleReportToSql,
       reportIndicatorToSql:reportIndicatorToSql
    };
    function buildPatientListExpression(queryParams, successCallback) {
        //Check for undefined params
        if(queryParams  === null || queryParams === undefined) return "";
        //Initialize returned obj
        var result={
            whereClause:"",
            resource:""
        };
        //create WhereClause
        _.each(indicatorsSchema, function (indicator) {
            if (indicator.name === queryParams.reportIndicator) {
                if (indicator.expression != "") {
                    result.whereClause= "and "+indicator.expression;
                }else{
                    result.whereClause= indicator.expression;
                }
            }
        });
        //identify resource/table
        _.each(reports,function(report) {
            if(report.name===queryParams.reportName) {
                result.resource=report.table['schema']+'.'+report.table['tableName'];
            }
        });
        successCallback(result);
    }
    function buildIndicatorsSchema(queryParams, successCallback) {
        //Check for undefined params
        if(queryParams  === null || queryParams === undefined) return "";
        var result=[];
        //Load json schema into the query builder
        _.each(reports,function(report) {
            if(report.name===queryParams.reportName) {
                _.each(report.indicators, function (reportIndicator) {
                    console.log('here is the requested indicators', reportIndicator);
                    _.each(indicatorsSchema, function (indicator) {
                        if (indicator.name === reportIndicator.expression) {
                            result.push(indicator);
                        }
                    });
                });
            }
        });
        successCallback(result);
    }
    function singleReportToSql(requestParams, successCallback) {
        if(requestParams  === null || requestParams === undefined) return "";
        _.each(reports,function(report) {
            if(report.name===requestParams.reportName) {
                var queryParts = {
                    columns: [(requestParams.supplementColumns||'location_uuid') + (indicatorsToColumns(report,requestParams.countBy))],
                    table: report.table['schema']+'.'+report.table['tableName'],
                    alias: report.table['alias'],
                    joins: joinsToSql(report.joins),
                    where: filtersToSql(requestParams.whereParams, report.parameters, report.filters),
                    group: groupClauseToSql(report.groupClause, requestParams.groupBy, report.parameters),
                    offset: requestParams.offset,
                    limit: requestParams.limit
                };
                successCallback(queryParts);
            }
        });
    }
    //converts a set of indicators into sql columns
    function indicatorsToColumns(report, countBy) {
        var result="";
        //Load json schema into the query builder
        _.each(report.indicators, function (singleIndicator) {
            _.each(indicatorsSchema, function (indicator) {
                if (indicator.name === singleIndicator.expression) {
                    result += ", ";
                    var column = indicator.reportIndicators[countBy].sql + ' as ' + indicator.name;
                    column = column.replace('$expression',indicator.expression);
                    result+=column;
                }
            });
        });

       return result;
    }
    //takes an expression of indicators like "number_with_no_vl / on_arvs" and converts into sql
    function reportIndicatorToSql(reportIndicator) {

    }
    //converts an array of tables into sql
    function joinsToSql(joins) {
        var result =[];
        _.each(joins,function(join) {
            var r = [join['schema']+'.'+join['tableName'], join['alias'], join['joinExpression'], join['joinType']];
            result.push(r);
        });
        return result;
    }
    //converts an array of group clause into squel consumable
    function groupClauseToSql(groupClauses, groupBy, reportParams) {
        var result =[];
        _.each(groupBy.split(','), function (by) {
            _.each(groupClauses,function(groupClause) {
                if(groupClause["parameter"]===by)
                {
                    _.each(reportParams, function (reportParam) {
                        if (reportParam["name"] === groupClause["parameter"]) {
                            _.each(reportParam["defaultValue"],function(value) {
                                result.push(value["expression"]);
                            });
                        }
                    });
                }
            });
        });
        return result;
    }
    //converts an array of filters into sql
    function filtersToSql(whereParams, reportParams, reportFilters) {
        var result =[];
        var expression ='';
        var parameters=[];
        _.each(reportFilters,function(reportFilter) {
            _.each(whereParams,function(whereParam) {
                //checks whether param value is set, if not set the filter is not pushed.
                //also checks if report filter parameter passed is eq to where param
                if(whereParam["name"]===reportFilter["parameter"] && whereParam["value"]) {
                    expression += reportFilter["expression"];
                    expression += ' and ';
                    _.each(reportParams, function (reportParam) {
                        if (reportParam["name"] === whereParam["name"]) {
                            _.each(whereParam["value"].split(','), function (whereParamValue) {
                                parameters.push(whereParamValue);
                            });
                        }
                    });
                }
            });
        });
        var lastIndex = expression.lastIndexOf('and');
        expression = expression.substring(0, lastIndex);
        result.push(expression);
        result.push.apply(result, parameters);
        return result;
    }

}();