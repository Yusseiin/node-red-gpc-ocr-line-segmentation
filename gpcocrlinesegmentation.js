module.exports = function(RED) {
function GcpToLineSegmentationNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;
		
/**
 * ray-casting algorithm based on
 * https://wrf.ecse.rpi.edu/Research/Short_Notes/pnpoly.html/pnpoly.html
 */
		function inside(point, vs) {
    // 
    var x = point[0], y = point[1];
    
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        
        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

function getYMax(data) {
    let v = data.textAnnotations[0].boundingPoly.vertices;
    let yArray = [];
    for(let i=0; i <4; i++){
        yArray.push(v[i]['y']);
    }
    return Math.max.apply(null, yArray);
}

/**
 * @Method inverts the y axis coordinates for easier computation
 * as the google vision starts the y axis from the bottom
 * @param data
 * @param yMax
 * @returns {*}
 */
function invertAxis(data, yMax) {
    data = fillMissingValues(data);
    for(let i=1; i < data.textAnnotations.length; i++ ){
        let v = data.textAnnotations[i].boundingPoly.vertices;
        for(let j=0; j <4; j++){
            v[j]['y'] = (yMax - v[j]['y']);
        }
    }
    return data;
}

/**
 * @Method sets zero to missing polygon coordinates. This behaviour has been observed  in images where
 * the text starts from the edge of the image. In such scenarios the x/y coordinates have been empty.
 * @param data
 * @returns {*}
 */
function fillMissingValues(data) {
    for(let i=1; i < data.textAnnotations.length; i++ ){
        let v = data.textAnnotations[i].boundingPoly.vertices;
        v.map((ver) => {
            if(ver['x'] === undefined){
                ver['x'] = 0;
            }
            if(ver['y'] === undefined){
                ver['y'] = 0;
            }
        });
    }
    return data;
}

/**
 *
 * @param mergedArray
 */
function getBoundingPolygon(mergedArray) {

    for(let i=0; i< mergedArray.length; i++) {
        let arr = [];

        // calculate line height
        let h1 = mergedArray[i].boundingPoly.vertices[0].y - mergedArray[i].boundingPoly.vertices[3].y;
        let h2 = mergedArray[i].boundingPoly.vertices[1].y - mergedArray[i].boundingPoly.vertices[2].y;
        let h = h1;
        if(h2> h1) {
            h = h2
        }
        let avgHeight = h * 0.6;

        arr.push(mergedArray[i].boundingPoly.vertices[1]);
        arr.push(mergedArray[i].boundingPoly.vertices[0]);
        let line1 = getRectangle(JSON.parse(JSON.stringify(arr)), true, avgHeight, true);

        arr = [];
        arr.push(mergedArray[i].boundingPoly.vertices[2]);
        arr.push(mergedArray[i].boundingPoly.vertices[3]);
        let line2 = getRectangle(JSON.parse(JSON.stringify(arr)), true, avgHeight, false);

        mergedArray[i]['bigbb'] = createRectCoordinates(line1, line2);
        mergedArray[i]['lineNum'] = i;
        mergedArray[i]['match'] = [];
        mergedArray[i]['matched'] = false;
    }
}


function combineBoundingPolygon(mergedArray) {
    // select one word from the array
    for(let i=0; i< mergedArray.length; i++) {

        let bigBB = mergedArray[i]['bigbb'];

        // iterate through all the array to find the match
        for(let k=i; k< mergedArray.length; k++) {
            // Do not compare with the own bounding box and which was not matched with a line
            if(k !== i && mergedArray[k]['matched'] === false) {
                let insideCount = 0;
                for(let j=0; j < 4; j++) {
                    let coordinate = mergedArray[k].boundingPoly.vertices[j];
                    if(inside([coordinate.x, coordinate.y], bigBB)){
                        insideCount += 1;
                    }
                }
                // all four point were inside the big bb
                if(insideCount === 4) {
                    let match = {matchCount: insideCount, matchLineNum: k};
                    mergedArray[i]['match'].push(match);
                    mergedArray[k]['matched'] = true;
                }

            }
        }
    }
}

function getRectangle(v, isRoundValues, avgHeight, isAdd) {
    if(isAdd){
        v[1].y = v[1].y + avgHeight;
        v[0].y = v[0].y + avgHeight;
    }else {
        v[1].y = v[1].y - avgHeight;
        v[0].y = v[0].y - avgHeight;
    }

    let yDiff = (v[1].y - v[0].y);
    let xDiff = (v[1].x - v[0].x);

    let gradient = yDiff / xDiff;

    let xThreshMin = 1;
    let xThreshMax = 2000;

    let yMin;
    let yMax;
    if(gradient === 0) {
        // extend the line
        yMin = v[0].y;
        yMax = v[0].y;
    }else{
        yMin = (v[0].y) - (gradient * (v[0].x - xThreshMin));
        yMax = (v[0].y) + (gradient * (xThreshMax - v[0].x));
    }
    if(isRoundValues) {
        yMin = Math.round(yMin);
        yMax = Math.round(yMax);
    }
    return {xMin : xThreshMin, xMax : xThreshMax, yMin: yMin, yMax: yMax};
}

function createRectCoordinates(line1, line2) {
    return [[line1.xMin, line1.yMin], [line1.xMax, line1.yMax], [line2.xMax, line2.yMax],[line2.xMin, line2.yMin]];
}




/**
 * GCP Vision groups several nearby words to appropriate lines
 * But will not group words that are too far away
 * This function combines nearby words and create a combined bounding polygon
 */
function initLineSegmentation(data) {

    const yMax = getYMax(data);
    data = invertAxis(data, yMax);

    // The first index refers to the auto identified words which belongs to a sings line
    let lines = data.textAnnotations[0].description.split('\n');

    // gcp vision full text
    let rawText = JSON.parse(JSON.stringify(data.textAnnotations));

    // reverse to use lifo, because array.shift() will consume 0(n)
    lines = lines.reverse();
    rawText = rawText.reverse();
    // to remove the zeroth element which gives the total summary of the text
    rawText.pop();

    let mergedArray = getMergedLines(lines, rawText);

    getBoundingPolygon(mergedArray);
    combineBoundingPolygon(mergedArray);

    // This does the line segmentation based on the bounding boxes
    return constructLineWithBoundingPolygon(mergedArray);
}

// TODO implement the line ordering for multiple words
function constructLineWithBoundingPolygon(mergedArray) {
    let finalArray = [];

    for(let i=0; i< mergedArray.length; i++) {
        if(!mergedArray[i]['matched']){
            if(mergedArray[i]['match'].length === 0){
                finalArray.push(mergedArray[i].description)
            }else{
                // arrangeWordsInOrder(mergedArray, i);
                // let index = mergedArray[i]['match'][0]['matchLineNum'];
                // let secondPart = mergedArray[index].description;
                // finalArray.push(mergedArray[i].description + ' ' +secondPart);
                finalArray.push(arrangeWordsInOrder(mergedArray, i));
            }
        }
    }
    return finalArray;
}

function getMergedLines(lines,rawText) {

    let mergedArray = [];
    while(lines.length !== 1) {
        let l = lines.pop();
        let l1 = JSON.parse(JSON.stringify(l));
        let status = true;

        let data = "";
        let mergedElement;

        while (true) {
            let wElement = rawText.pop();
            if(wElement === undefined) {
                break;
            }
            let w = wElement.description;

            let index = l.indexOf(w);
            let temp;
            // check if the word is inside
            l = l.substring(index + w.length);
            if(status) {
                status = false;
                // set starting coordinates
                mergedElement = wElement;
            }
            if(l === ""){
                // set ending coordinates
                mergedElement.description = l1;
                mergedElement.boundingPoly.vertices[1] = wElement.boundingPoly.vertices[1];
                mergedElement.boundingPoly.vertices[2] = wElement.boundingPoly.vertices[2];
                mergedArray.push(mergedElement);
                break;
            }
        }
    }
    return mergedArray;
}

function arrangeWordsInOrder(mergedArray, k) {
    let mergedLine = '';
    let wordArray = [];
    let line = mergedArray[k]['match'];
    // [0]['matchLineNum']
    for(let i=0; i < line.length; i++){
        let index = line[i]['matchLineNum'];
        let matchedWordForLine = mergedArray[index].description;

        let mainX = mergedArray[k].boundingPoly.vertices[0].x;
        let compareX = mergedArray[index].boundingPoly.vertices[0].x;

        if(compareX > mainX) {
            mergedLine = mergedArray[k].description + ' ' + matchedWordForLine;
        }else {
            mergedLine = matchedWordForLine + ' ' + mergedArray[k].description;
        }
    }
    return mergedLine;
}


/**
 * GCP Vision groups several nearby words to appropriate lines
 * But will not group words that are too far away
 * This function combines nearby words and create a combined bounding polygon
 */
function initLineSegmentation(data) {

    const yMax = getYMax(data);
    data = invertAxis(data, yMax);

    // The first index refers to the auto identified words which belongs to a sings line
    let lines = data.textAnnotations[0].description.split('\n');

    // gcp vision full text
    let rawText = data.textAnnotations;

    // reverse to use lifo, because array.shift() will consume 0(n)
    lines = lines.reverse();
    rawText = rawText.reverse();
    // to remove the zeroth element which gives the total summary of the text
    rawText.pop();

    let mergedArray = getMergedLines(lines, rawText);

    getBoundingPolygon(mergedArray);
    combineBoundingPolygon(mergedArray);

    // This does the line segmentation based on the bounding boxes
    return constructLineWithBoundingPolygon(mergedArray);
}

// TODO implement the line ordering for multiple words
function constructLineWithBoundingPolygon(mergedArray) {
    let finalArray = [];

    for(let i=0; i< mergedArray.length; i++) {
        if(!mergedArray[i]['matched']){
            if(mergedArray[i]['match'].length === 0){
                finalArray.push(mergedArray[i].description)
            }else{
                // arrangeWordsInOrder(mergedArray, i);
                // let index = mergedArray[i]['match'][0]['matchLineNum'];
                // let secondPart = mergedArray[index].description;
                // finalArray.push(mergedArray[i].description + ' ' +secondPart);
                finalArray.push(arrangeWordsInOrder(mergedArray, i));
            }
        }
    }
    return finalArray;
}

function getMergedLines(lines,rawText) {

    let mergedArray = [];
    while(lines.length !== 1) {
        let l = lines.pop();
        let l1 = l;
        let status = true;

        let data = "";
        let mergedElement;

        while (true) {
            let wElement = rawText.pop();
            if(wElement === undefined) {
                break;
            }
            let w = wElement.description;

            let index = l.indexOf(w);
            let temp;
            // check if the word is inside
            l = l.substring(index + w.length);
            if(status) {
                status = false;
                // set starting coordinates
                mergedElement = wElement;
            }
            if(l === ""){
                // set ending coordinates
                mergedElement.description = l1;
                mergedElement.boundingPoly.vertices[1] = wElement.boundingPoly.vertices[1];
                mergedElement.boundingPoly.vertices[2] = wElement.boundingPoly.vertices[2];
                mergedArray.push(mergedElement);
                break;
            }
        }
    }
    return mergedArray;
}

function arrangeWordsInOrder(mergedArray, k) {
    let mergedLine = '';
    let wordArray = [];
    let line = mergedArray[k]['match'];
    // [0]['matchLineNum']
    for(let i=0; i < line.length; i++){
        let index = line[i]['matchLineNum'];
        let matchedWordForLine = mergedArray[index].description;

        let mainX = mergedArray[k].boundingPoly.vertices[0].x;
        let compareX = mergedArray[index].boundingPoly.vertices[0].x;

        if(compareX > mainX) {
            mergedLine = mergedArray[k].description + ' ' + matchedWordForLine;
        }else {
            mergedLine = matchedWordForLine + ' ' + mergedArray[k].description;
        }
    }
    return mergedLine;
}

		node.on('input', function(msg) {
			this.status({fill:"green",shape:"ring",text:"starting"});
            msg.payload = initLineSegmentation(msg.payload.responses[0]);
			this.status({fill:"green",shape:"ring",text:"done"});
            node.send(msg);
        });
}
  RED.nodes.registerType("gpcocrlinesegmentation",GcpToLineSegmentationNode);
}