// =========================================================================
// Forest Canopy Cover
// Author: Miguel Alexandre da Cunha
// Contact: miguel.cunha@inpe.br
// =========================================================================

var Map = ui.Map();
Map.setOptions('ROADMAP');

// ---- Configurable defaults ----
var DEFAULT_START_DATE = '2024-07-31';
var DEFAULT_END_DATE = '2026-08-01';
var DEFAULT_CLOUD_LIMIT = 20;
var DEFAULT_BUFFER_RADIUS_M = 100;
var TRAIN_SCALE = 10;
var TRAIN_PIXELS = 5000;
var TALL_TREE_THRESHOLD_M = 5;
var CANOPY_HEIGHT_ID = 'projects/meta-forest-monitoring-okw37/assets/CanopyHeight';
var S2_BASEMAP_ZOOM_THRESHOLD = 12;
var S2_BASEMAP_MONTHS_BACK = 3;
var S2_BASEMAP_CLOUD_LIMIT = 30;

// Sentinel-2 high-contrast visual parameters
var S2_VIS_PARAMS = {bands: ['B4', 'B3', 'B2'], min: 0, max: 2000, gamma: 1.1};

var roi = null;

// ---- Live Sentinel-2 basemap that appears on zoom-in ----
var s2BasemapLayer = null;

function updateS2Basemap() {
  var zoom = Map.getZoom();
  if (zoom >= S2_BASEMAP_ZOOM_THRESHOLD) {
    var bounds = Map.getBounds(true);
    var recent = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(bounds)
      .filterDate(ee.Date(Date.now()).advance(-S2_BASEMAP_MONTHS_BACK, 'month'), ee.Date(Date.now()))
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', S2_BASEMAP_CLOUD_LIMIT))
      .median();
    var visualized = recent.visualize(S2_VIS_PARAMS);
    if (s2BasemapLayer) {
      s2BasemapLayer.setEeObject(visualized);
    } else {
      s2BasemapLayer = ui.Map.Layer(visualized, {}, 'Sentinel-2 live basemap');
      Map.layers().insert(0, s2BasemapLayer);
    }
  } else if (s2BasemapLayer) {
    Map.layers().remove(s2BasemapLayer);
    s2BasemapLayer = null;
  }
}
var debouncedUpdateS2Basemap = ui.util.debounce(updateS2Basemap, 600);
Map.onChangeBounds(debouncedUpdateS2Basemap);

// ---- Polygon drawing support (red outline, transparent fill) ----
var drawnGeometry = null;
var outlineLayer = null;
var drawingTools = Map.drawingTools();
drawingTools.setShown(true);
drawingTools.setDrawModes(['polygon']);
drawingTools.setLinked(false);

function refreshOutline(geom) {
  if (outlineLayer) {
    Map.layers().remove(outlineLayer);
    outlineLayer = null;
  }
  if (!geom) return;
  var outlineImage = ee.Image().paint({featureCollection: ee.FeatureCollection(ee.Feature(geom)), color: 1, width: 2});
  outlineLayer = ui.Map.Layer(outlineImage, {palette: ['red']}, 'AOI outline');
  Map.layers().add(outlineLayer);
}

function captureDrawnShape() {
  var layers = drawingTools.layers();
  if (layers.length() > 0) {
    var activeLayer = layers.get(layers.length() - 1);
    drawnGeometry = activeLayer.getEeObject();
    activeLayer.setShown(false); // hide default translucent fill
    refreshOutline(drawnGeometry);
  }
}
drawingTools.onDraw(captureDrawnShape);
drawingTools.onEdit(captureDrawnShape);

// =========================================================================
// UI Panel & Legend Setup 
// =========================================================================
var panel = ui.Panel({style: {width: '340px', padding: '8px'}});
panel.add(ui.Label({
  value: 'Forest Canopy Cover',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '8px 8px 2px 8px'
  }
}));

panel.add(ui.Label({
  value: 'Developed by Miguel Alexandre da Cunha',
  style: {
    fontSize: '11px',
    color: '#777777',
    margin: '0 8px 12px 8px'
  }
}));
panel.add(ui.Label('1.Region of Interest', {fontWeight: 'bold'}));
var latBox = ui.Textbox({placeholder: '-17.5438', value: ''});
var lonBox = ui.Textbox({placeholder: '-55.7287', value: ''});
var bufferBox = ui.Textbox({placeholder: '100', value: String(DEFAULT_BUFFER_RADIUS_M)});
panel.add(ui.Panel([
  ui.Label('Latitude:'), latBox,
  ui.Label('Longitude:'), lonBox,
  ui.Label('ROI in meters:'), bufferBox
]));
panel.add(ui.Label('Or draw a polygon on the map, then click Run Analysis.', {fontStyle: 'italic', fontSize: '11px', color: 'gray'}));

panel.add(ui.Label('2. Sentinel-2 search parameters', {fontWeight: 'bold'}));
var startBox = ui.Textbox({placeholder: 'YYYY-MM-dd', value: DEFAULT_START_DATE});
var endBox = ui.Textbox({placeholder: 'YYYY-MM-dd', value: DEFAULT_END_DATE});
var cloudBox = ui.Textbox({value: String(DEFAULT_CLOUD_LIMIT)});
panel.add(ui.Panel([
  ui.Label('Start date:'), startBox,
  ui.Label('End date:'), endBox,
  ui.Label('Max cloud percentage:'), cloudBox
]));

var runButton = ui.Button({label: 'Run Analysis', onClick: runAnalysis});
panel.add(runButton);
panel.add(ui.Label(''));

var resultsPanel = ui.Panel({style: {padding: '6px', border: '1px solid #ccc', margin: '8px 0'}});
resultsPanel.add(ui.Label('Results will appear here.', {color: 'gray'}));
panel.add(resultsPanel);

// Dynamic Legend Panel
var legendPanel = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)'
  }
});

function renderDynamicLegend(hasForest, ndviMin, ndviMax, heightMin, heightMax) {
  legendPanel.clear();
  legendPanel.add(ui.Label('Map Legend', {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0'}));

  function makeRow(color, label) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: color,
        padding: '8px',
        margin: '0 6px 0 0',
        border: '1px solid #999'
      }
    });
    var description = ui.Label({value: label, style: {margin: '0', fontSize: '12px'}});
    return ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal'),
      style: {margin: '2px 0'}
    });
  }

  // K-Means Legend
  if (hasForest) {
    legendPanel.add(ui.Label('Forest Cover (K-Means)', {fontWeight: 'bold', fontSize: '12px', margin: '4px 0 2px 0'}));
    legendPanel.add(makeRow('#2ecc71', 'Forest area'));
  }

  // NDVI Legend using colors matched to EE layer palette ['blue', 'white', 'green']
  if (ndviMin !== null && ndviMax !== null) {
    var ndviBins = [
      {min: 0.0, max: 0.2, label: '0.0 - 0.2', color: '#1a1aff'},
      {min: 0.2, max: 0.4, label: '0.2 - 0.4', color: '#8080ff'},
      {min: 0.4, max: 0.6, label: '0.4 - 0.6', color: '#ffffff'}, // White interval
      {min: 0.6, max: 0.8, label: '0.6 - 0.8', color: '#99cc99'},
      {min: 0.8, max: 1.0, label: '0.8 - 1.0', color: '#008000'}
    ];

    // Cushion tolerance (0.05) to ensure boundary pixels match visual rendering
    var tol = 0.05;
    var visibleNdviBins = ndviBins.filter(function(b) {
      return (ndviMax + tol) >= b.min && (ndviMin - tol) <= b.max;
    });

    if (visibleNdviBins.length > 0) {
      legendPanel.add(ui.Label('NDVI', {fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
      visibleNdviBins.forEach(function(b) {
        legendPanel.add(makeRow(b.color, b.label));
      });
    }
  }

  // Canopy Height Legend
  if (heightMin !== null && heightMax !== null) {
    var canopyBins = [
      {min: 0, max: 5, label: '0 - 5 m', color: '#ffffcc'},
      {min: 5, max: 10, label: '5 - 10 m', color: '#c7e9b4'},
      {min: 10, max: 15, label: '10 - 15 m', color: '#78c679'},
      {min: 15, max: 20, label: '15 - 20 m', color: '#41ab5d'},
      {min: 20, max: 25, label: '20 - 25 m', color: '#238443'},
      {min: 25, max: 30, label: '25 - 30 m', color: '#004529'},
      {min: 30, max: 1000, label: '> 30 m', color: '#002616'}
    ];

    var cTol = 0.5;
    var visibleCanopyBins = canopyBins.filter(function(b) {
      return (heightMax + cTol) >= b.min && (heightMin - cTol) <= b.max;
    });

    if (visibleCanopyBins.length > 0) {
      legendPanel.add(ui.Label('Canopy Height', {fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px 0'}));
      visibleCanopyBins.forEach(function(b) {
        legendPanel.add(makeRow(b.color, b.label));
      });
    }
  }

  Map.add(legendPanel);
}

ui.root.clear();
ui.root.add(ui.SplitPanel({firstPanel: panel, secondPanel: Map, orientation: 'horizontal'}));

// =========================================================================
// Main
// =========================================================================
function runAnalysis() {
  Map.layers().reset();
  s2BasemapLayer = null;
  outlineLayer = null;
  legendPanel.clear();
  resultsPanel.clear();
  resultsPanel.add(ui.Label('Loading area of interest...', {color: 'gray'}));

  var startDate = startBox.getValue();
  var endDate = endBox.getValue();
  var cloudLimit = parseFloat(cloudBox.getValue());

  if (isNaN(cloudLimit)) {
    resultsPanel.clear();
    resultsPanel.add(ui.Label('Enter a valid cloud percentage.', {color: 'red'}));
    return;
  }

  if (drawnGeometry) {
    roi = drawnGeometry; // use actual drawn polygon, not its bounding box
    Map.centerObject(roi, 16);
  } else {
    var lat = parseFloat(latBox.getValue());
    var lon = parseFloat(lonBox.getValue());
    var bufferRadius = parseFloat(bufferBox.getValue());

    if (isNaN(lat) || isNaN(lon)) {
      resultsPanel.clear();
      resultsPanel.add(ui.Label('Enter valid numeric latitude and longitude, or draw a polygon on the map.', {color: 'red'}));
      return;
    }
    if (isNaN(bufferRadius) || bufferRadius <= 0) {
      resultsPanel.clear();
      resultsPanel.add(ui.Label('Enter a valid positive number for buffer radius.', {color: 'red'}));
      return;
    }

    roi = ee.Geometry.Point([lon, lat]).buffer(bufferRadius).bounds();
    Map.centerObject(roi, 16);
  }

  var s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(roi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudLimit));

  s2Collection.size().evaluate(function(count) {
    if (!count) {
      resultsPanel.clear();
      resultsPanel.add(ui.Label(
        'No Sentinel-2 images found for this date range and cloud limit. ' +
        'Try increasing the date range or the cloud percentage.', {color: 'red'}));
      return;
    }

    // 1. Sentinel-2 basemap in background
    var s2Base = s2Collection.median();
    Map.addLayer(s2Base, S2_VIS_PARAMS, 'Sentinel-2 basemap', true);

    runKMeans(s2Collection, function(ndvi, forestPixels) {
      runCanopyHeight(ndvi, forestPixels);
    });
  });
}

// =========================================================================
// K-means Forest Cover
// =========================================================================
function runKMeans(s2Collection, onComplete) {
  var s2Image_clip = s2Collection.median().clip(roi);
  var latestImage = s2Collection.sort('system:time_start', false).first();
  var imageDate = latestImage.date().format('YYYY-MM-dd');

  var ndvi = s2Image_clip.normalizedDifference(['B8', 'B4']).rename('NDVI');

  var trainingSamples = ndvi.sample({
    region: roi, scale: TRAIN_SCALE, numPixels: TRAIN_PIXELS, seed: 42
  });
  var clusterer = ee.Clusterer.wekaKMeans(2).train(trainingSamples);
  var kmeansClustered = ndvi.cluster(clusterer).rename('cluster');

  var clusterMeans = ndvi.addBands(kmeansClustered).reduceRegion({
    reducer: ee.Reducer.mean().group({groupField: 1, groupName: 'cluster'}),
    geometry: roi, scale: 10, maxPixels: 1e9, bestEffort: true
  });
  var pixelCount = kmeansClustered.reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: roi, scale: 10, maxPixels: 1e9, bestEffort: true
  });

  ee.Dictionary({
    date: imageDate,
    means: clusterMeans.get('groups'),
    histogram: pixelCount.get('cluster')
  }).evaluate(function(data) {
    if (!data || !data.means || data.means.length < 2) {
      resultsPanel.clear();
      resultsPanel.add(ui.Label('Error computing cluster statistics (AOI may be too small/uniform).', {color: 'red'}));
      return;
    }
    var c0 = data.means[0].mean, c1 = data.means[1].mean;
    var forestClusterKey = (c0 > c1) ? '0' : '1';
    var hist = data.histogram || {};
    var count0 = hist['0'] || 0, count1 = hist['1'] || 0;
    var totalPixels = count0 + count1;
    var forestPixels = hist[forestClusterKey] || 0;
    var forestPct = totalPixels > 0 ? ((forestPixels / totalPixels) * 100).toFixed(2) : '0.00';

    var thresholdValue = ((c0 + c1) / 2).toFixed(2);
    var forestClusterId = parseInt(forestClusterKey, 10);
    var finalClassification = kmeansClustered.eq(forestClusterId);

    // 2. Sentinel-2 clipped to ROI on K-Means date
    Map.addLayer(latestImage.clip(roi), S2_VIS_PARAMS, 'Sentinel-2 (' + data.date + ')', true);

    // 3. NDVI layer
    Map.addLayer(ndvi, {min: 0, max: 1, palette: ['blue', 'white', 'green']}, 'NDVI', false);

    // 4. K-means classification layer
    Map.addLayer(finalClassification.selfMask(), {palette: ['#2ecc71']}, 'Forest Cover (K-Means) - ' + data.date, true);

    resultsPanel.clear();
    resultsPanel.add(ui.Label('Forest Cover (K-Means)', {fontWeight: 'bold'}));
    resultsPanel.add(ui.Label('Image date: ' + data.date));
    resultsPanel.add(ui.Label('Threshold: ' + thresholdValue));
    resultsPanel.add(ui.Label('Forest cover: ' + forestPct + '%', {fontWeight: 'bold', color: 'green'}));

    if (onComplete) onComplete(ndvi, forestPixels);
  });
}

// =========================================================================
// Canopy Height
// =========================================================================
function runCanopyHeight(ndvi, forestPixels) {
  var canopy = ee.ImageCollection(CANOPY_HEIGHT_ID).mosaic().clip(roi).rename('height');
  var heightVis = {min: 0, max: 30, palette: ['#ffffcc','#78c679','#238443','#004529']};
  
  // 5. Canopy height layer
  Map.addLayer(canopy, heightVis, 'Canopy Height (m)', false);

  var roiOutline = ee.Image().byte().paint({
    featureCollection: ee.FeatureCollection(ee.Feature(roi)),
    color: 1, width: 2
  });
  
  // 6. ROI boundary line
  Map.addLayer(roiOutline, {palette: 'yellow'}, 'ROI', true);

  // Compute exact ROI ranges for NDVI and Canopy Height
  var ndviStats = ndvi.reduceRegion({
    reducer: ee.Reducer.minMax(),
    geometry: roi, scale: 10, maxPixels: 1e9, bestEffort: true
  });

  var canopyStats = canopy.reduceRegion({
    reducer: ee.Reducer.minMax().combine({reducer2: ee.Reducer.mean(), sharedInputs: true}),
    geometry: roi, scale: 1, maxPixels: 1e10, bestEffort: true, tileScale: 4
  });

  var tallPct = canopy.gt(TALL_TREE_THRESHOLD_M).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: roi, scale: 1,
    maxPixels: 1e10, bestEffort: true, tileScale: 4
  });

  ee.Dictionary({
    ndviStats: ndviStats,
    canopyStats: canopyStats,
    tallFrac: tallPct.get('height')
  }).evaluate(function(res) {
    resultsPanel.add(ui.Label('Canopy Height (Meta 1m)', {fontWeight: 'bold'}));
    
    var cStats = res ? res.canopyStats : null;
    var nStats = res ? res.ndviStats : null;

    if (!cStats || cStats.height_mean === undefined || cStats.height_mean === null) {
      resultsPanel.add(ui.Label('No canopy height data returned for this AOI.', {color: 'red'}));
    } else {
      resultsPanel.add(ui.Label('Height range: ' + cStats.height_min.toFixed(2) + ' m - ' + cStats.height_max.toFixed(2) + ' m'));
      resultsPanel.add(ui.Label('Mean height: ' + cStats.height_mean.toFixed(2) + ' m'));
      var tallPctVal = res.tallFrac !== null ? (res.tallFrac * 100).toFixed(2) : 'N/A';
      resultsPanel.add(ui.Label('Area with canopy > ' + TALL_TREE_THRESHOLD_M + ' m: ' + tallPctVal + '%',
        {fontWeight: 'bold', color: 'darkgreen'}));
    }

    var hasForest = forestPixels > 0;
    var ndviMin = nStats ? nStats.NDVI_min : null;
    var ndviMax = nStats ? nStats.NDVI_max : null;
    var heightMin = cStats ? cStats.height_min : null;
    var heightMax = cStats ? cStats.height_max : null;

    // Render dynamic legend as the final step
    renderDynamicLegend(hasForest, ndviMin, ndviMax, heightMin, heightMax);
  });
}