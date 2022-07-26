# node-red-gpc-ocr-line-segmentation
Performs line segmentation based on characters polygon coordinates for data extraction for gpc ocr in node-red.

Based on: https://github.com/sshniro/line-segmentation-algorithm-to-gcp-vision

# Introduction

Google Vision provides 2 options for optical character recognition(OCR).

````
- Option 1: TEXT_DETECTION - Words with coordinates
- Option 2: DOCUMENT_TEXT_DETECTION - OCR on dense text to extract lines and paragraph information
````

The second option is suitable for data extraction from articles (Dense Text such as News Papers/Books). This option has an 
intelligent segmentation method to merge words which are nearby and form lines and paragraphs.
 
This feature is not desirable for images with sparse text content such as retail invoices, where the data relevant to the same line
resides in two corners (A huge gap/whitespace between the product name and price). For these images the OCR segments the 
lines in a different order. If the distance of two words in a single line is too far apart then google vision identifies 
them as two separate paragraphs/lines. 

The below images shows the sample output for a typical invoice from google vision.

<img width="1198" alt="screen shot 2018-01-15 at 3 55 59 pm" src="https://user-images.githubusercontent.com/13045528/34937970-9f2e93b8-fa0c-11e7-9521-0fc6ad191e0d.png">

This behaviour creates a problem in information extraction scenarios. For example, to extract a price of a product from a 
retail invoice the system needs to find a way to match the words in the same line. The algorithm proposed below performs 
line segmentation based on characters polygon coordinates for data extraction.

## Usage Guide

Usage instruction for each programing language is located in the ReadMe files inside the relevant folders.

### Proposed Algorithm

The implemented algorithm runs in two stages

- Stage 1 - Groups nearby words to generate a longer strip of line
- Stage 2 - Connects words which are far apart using the bounding polygon approach

<img width="437" alt="screen shot 2018-01-15 at 4 50 31 pm" src="https://user-images.githubusercontent.com/13045528/34940084-415cf57e-fa14-11e7-8099-ffa7fbce1b21.png">


## Explanation.

Stage one helps to reduce the computations needed for the second phase of the algorithm. In the first phase the algorithms
tries to merge words/characters which are very near. Stage 1 should be completed because for price related text like $3.40 is presented as 2 words by 
Google Vision (word 1: `$3.` word 2:`,40`). The first stage helps to concat nearby characters to form a text-block/word. 
This step helps reduces the computation needed for the second phase.

The stage 2 algorithm draws an imaginary bounding polygon (with a threshold) over the words and computes the 
words which belongs to each line.

## Issues.

The algorithm successfully works for most of the slanted and slightly crumpled images. But it will fail to highly 
crumpled or folded images.


## Future Work

Try to implement the water-flow algorithm for line segmentation and measure accuracies with bounding polygon approach. 

<img width="211" alt="waterflow" src="https://user-images.githubusercontent.com/13045528/34940259-d6899526-fa14-11e7-9b6c-4b3a2aaa1a75.png">
