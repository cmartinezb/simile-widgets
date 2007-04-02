/*==================================================
 *  Exhibit.TimelineView
 *==================================================
 */
 
Exhibit.TimelineView = function(containerElmt, uiContext) {
    this._div = containerElmt;
    this._uiContext = uiContext;
    
    this._settings = {};
    this._accessors = {
        getEventLabel:  function(itemID, database, visitor) { visitor(database.getObject(itemID, "label")); },
        getProxy:       function(itemID, database, visitor) { visitor(itemID); }
    };

    this._colorMap = new Object();
    this._maxColorIndex = 0;
    
    this._largestSize = 0;
    
    var view = this;
    this._listener = { 
        onItemsChanged: function() {
            view._reconstruct(); 
        }
    };
    uiContext.getCollection().addListener(this._listener);
};

Exhibit.TimelineView._intervalChoices = [
    "millisecond", "second", "minute", "hour", "day", "week", "month", "year", "decade", "century", "millennium"
];

Exhibit.TimelineView._settingSpecs = {
    "topBandHeight":           { type: "int",        defaultValue: 75 },
    "topBandUnit":             { type: "enum",       choices: Exhibit.TimelineView._intervalChoices },
    "topBandPixelsPerUnit":    { type: "int",        defaultValue: 200 },
    "bottomBandHeight":        { type: "int",        defaultValue: 25 },
    "bottomBandUnit":          { type: "enum",       choices: Exhibit.TimelineView._intervalChoices },
    "bottomBandPixelsPerUnit": { type: "int",        defaultValue: 200 },
    "timelineHeight":          { type: "int",        defaultValue: 400 },
    "timelineConstructor":     { type: "function",   defaultValue: null }
};

Exhibit.TimelineView._accessorSpecs = [
    {   accessorName:   "getProxy",
        attributeName:  "proxy"
    },
    {   accessorName: "getDuration",
        bindings: [
            {   attributeName:  "start",
                type:           "date",
                bindingName:    "start"
            },
            {   attributeName:  "end",
                type:           "date",
                bindingName:    "end",
                optional:       true
            }
        ]
    },
    {   accessorName:   "getColor",
        attributeName:  "marker",
        type:           "text"
    },
    {   accessorName:   "getEventLabel",
        attributeName:  "eventLabel",
        type:           "text"
    }
];

Exhibit.TimelineView.create = function(configuration, containerElmt, uiContext) {
    var view = new Exhibit.TimelineView(
        containerElmt,
        Exhibit.UIContext.create(configuration, uiContext)
    );
    Exhibit.TimelineView._configure(view, configuration);
    
    view._initializeUI();
    return view;
};

Exhibit.TimelineView.createFromDOM = function(configElmt, containerElmt, uiContext) {
    var configuration = Exhibit.getConfigurationFromDOM(configElmt);
    var view = new Exhibit.TimelineView(
        containerElmt != null ? containerElmt : configElmt, 
        Exhibit.UIContext.createFromDOM(configElmt, uiContext)
    );
    
    Exhibit.SettingsUtilities.createAccessorsFromDOM(configElmt, Exhibit.TimelineView._accessorSpecs, view._accessors);
    Exhibit.SettingsUtilities.collectSettingsFromDOM(configElmt, Exhibit.TimelineView._settingSpecs, view._settings);
    Exhibit.TimelineView._configure(view, configuration);
    
    view._initializeUI();
    return view;
};

Exhibit.TimelineView._configure = function(view, configuration) {
    Exhibit.SettingsUtilities.createAccessors(configuration, Exhibit.TimelineView._accessorSpecs, view._accessors);
    Exhibit.SettingsUtilities.collectSettings(configuration, Exhibit.TimelineView._settingSpecs, view._settings);
    
    var accessors = view._accessors;
    view._getDuration = function(itemID, database, visitor) {
        accessors.getProxy(itemID, database, function(proxy) {
            accessors.getDuration(proxy, database, visitor);
        });
    };
};

Exhibit.TimelineView.prototype.dispose = function() {
    this._uiContext.getCollection().removeListener(this._listener);
    
    this._timeline = null;
    this._dom.dispose();
    this._dom = null;
    
    this._div.innerHTML = "";
    this._div = null;
    
    this._uiContext.dispose();
    this._uiContext = null;
};

Exhibit.TimelineView.prototype._initializeUI = function() {
    var self = this;
    
    this._div.innerHTML = "";
    this._dom = Exhibit.ViewUtilities.constructPlottingViewDom(
        this._div, 
        this._uiContext, 
        true, // showSummary
        {   onResize: function() { 
                self._timeline.layout();
            } 
        }, 
        {}
    );    
    
    this._eventSource = new Timeline.DefaultEventSource();
    this._reconstruct();
};

Exhibit.TimelineView.prototype._reconstructTimeline = function(newEvents) {
    var settings = this._settings;
    
    if (this._timeline != null) {
        this._timeline.dispose();
    }
    
    if (newEvents) {
        this._eventSource.addMany(newEvents);
    }
    
    var timelineDiv = this._dom.plotContainer;
    if (settings.timelineConstructor != null) {
        this._timeline = settings.timelineConstructor(timelineDiv, this._eventSource);
    } else {
        timelineDiv.style.height = settings.timelineHeight + "px";
        timelineDiv.className = "exhibit-timelineView-timeline";

        var theme = Timeline.ClassicTheme.create();
        theme.event.bubble.width = this._uiContext.getSetting("bubbleWidth");
        theme.event.bubble.height = this._uiContext.getSetting("bubbleHeight");
        
        var topIntervalUnit, bottomIntervalUnit;
        if (settings.topBandUnit != null || settings.bottomBandUnit != null) {
            if (Exhibit.TimelineView._intervalLabelMap == null) {
                Exhibit.TimelineView._intervalLabelMap = {
                    "millisecond":      Timeline.DateTime.MILLISECOND,
                    "second":           Timeline.DateTime.SECOND,
                    "minute":           Timeline.DateTime.MINUTE,
                    "hour":             Timeline.DateTime.HOUR,
                    "day":              Timeline.DateTime.DAY,
                    "week":             Timeline.DateTime.WEEK,
                    "month":            Timeline.DateTime.MONTH,
                    "year":             Timeline.DateTime.YEAR,
                    "decade":           Timeline.DateTime.DECADE,
                    "century":          Timeline.DateTime.CENTURY,
                    "millennium":       Timeline.DateTime.MILLENNIUM
                };
            }
            
            if (settings.topBandUnit == null) {
                bottomIntervalUnit = Exhibit.TimelineView._intervalLabelMap[settings.bottomBandUnit];
                topIntervalUnit = bottomIntervalUnit - 1;
            } else if (settings.bottomBandUnit == null) {
                topIntervalUnit = Exhibit.TimelineView._intervalLabelMap[settings.topBandUnit];
                bottomIntervalUnit = topIntervalUnit + 1;
            } else {
                topIntervalUnit = Exhibit.TimelineView._intervalLabelMap[settings.topBandUnit];
                bottomIntervalUnit = Exhibit.TimelineView._intervalLabelMap[settings.bottomBandUnit];
            }
        } else { // figure this out dynamically
            var earliest = this._eventSource.getEarliestDate();
            var latest = this._eventSource.getLatestDate();
            
            var totalDuration = latest.getTime() - earliest.getTime();
            var totalEventCount = this._eventSource.getCount();
            if (totalDuration > 0 && totalEventCount > 1) {
                var totalDensity = totalEventCount / totalDuration;
                
                var topIntervalUnit = Timeline.DateTime.MILLENNIUM;
                while (topIntervalUnit > 0) {
                    var intervalDuration = Timeline.DateTime.gregorianUnitLengths[topIntervalUnit];
                    var eventsPerPixel = totalDensity * intervalDuration / settings.topBandPixelsPerUnit;
                    if (eventsPerPixel < 0.01) {
                        break;
                    }
                    topIntervalUnit--;
                }
            } else {
                topIntervalUnit = Timeline.DateTime.YEAR;
            }
            bottomIntervalUnit = topIntervalUnit + 1;
        }
        
        var bandInfos = [
            Timeline.createBandInfo({
                width:          settings.topBandHeight + "%", 
                intervalUnit:   topIntervalUnit, 
                intervalPixels: settings.topBandPixelsPerUnit,
                eventSource:    this._eventSource,
                //date:           earliest,
                theme:          theme
            }),
            Timeline.createBandInfo({
                width:          settings.bottomBandHeight + "%", 
                intervalUnit:   bottomIntervalUnit, 
                intervalPixels: settings.bottomBandPixelsPerUnit,
                eventSource:    this._eventSource,
                //date:           earliest,
                showEventText:  false, 
                trackHeight:    0.5,
                trackGap:       0.2,
                theme:          theme
            })
        ];
        bandInfos[1].syncWith = 0;
        bandInfos[1].highlight = true;
        bandInfos[1].eventPainter.setLayout(bandInfos[0].eventPainter.getLayout());

        this._timeline = Timeline.create(timelineDiv, bandInfos, Timeline.HORIZONTAL);
    }
};

Exhibit.TimelineView.prototype._reconstruct = function() {
    var self = this;
    var collection = this._uiContext.getCollection();
    var database = this._uiContext.getDatabase();
    var settings = this._settings;
    var accessors = this._accessors;
    
    /*
     *  Get the current collection and check if it's empty
     */
    var currentSize = collection.countRestrictedItems();
    var unplottableItems = [];
    
    this._dom.legendWidget.clear();
    this._eventSource.clear();
    
    if (currentSize > 0) {
        var currentSet = collection.getRestrictedItems();
        var legendWidget = this._dom.legendWidget;
        var events = [];
        
        var addEvent = function(itemID, duration, colorData) {
            var label;
            accessors.getEventLabel(itemID, database, function(v) { label = v; return true; });
            
            var evt = new Timeline.DefaultEventSource.Event(
                duration.start,
                duration.end,
                null,
                null,
                duration.end == null, // is instant?
                label,
                "",     // description
                null,   // image url
                null,   // link url
                null,   // icon url
                "#" + colorData.color,
                "#" + (duration.end == null ? colorData.color : colorData.textColor)
            );
            evt._itemID = itemID;
            evt.getProperty = function(name) {
                return database.getObject(this._itemID, name);
            };
            evt.fillInfoBubble = function(elmt, theme, labeller) {
                self._fillInfoBubble(this, elmt, theme, labeller);
            };
            
            events.push(evt);
        };
        
        currentSet.visit(function(itemID) {
            var durations = [];
            self._getDuration(itemID, database, function(duration) { if ("start" in duration) durations.push(duration); });
            
            if (durations.length > 0) {
                var colorKey = null;
                accessors.getColor(itemID, database, function(v) { colorKey = v; });
                
                var colorData;
                if (colorKey in self._colorMap) {
                    colorData = self._colorMap[colorKey];
                } else {
                    colorData = Exhibit.TimelineView.theme.markers[self._maxColorIndex];
                    self._colorMap[colorKey] = colorData;
                    self._maxColorIndex = (self._maxColorIndex + 1) % Exhibit.TimelineView.theme.markers.length;
                }
                legendWidget.addEntry(colorKey, colorData.color, colorKey);
                
                for (var i = 0; i < durations.length; i++) {
                    addEvent(itemID, durations[i], colorData);
                }
            } else {
                unplottableItems.push(itemID);
            }
        });
        
        var plottableSize = currentSize - unplottableItems.length;
        if (plottableSize > this._largestSize) {
            this._largestSize = plottableSize;
            this._reconstructTimeline(events);
        } else {
            this._eventSource.addMany(events);
        }
        
        var band = this._timeline.getBand(0);
        var centerDate = band.getCenterVisibleDate();
        if (centerDate < this._eventSource.getEarliestDate()) {
            band.scrollToCenter(this._eventSource.getEarliestDate());
        } else if (centerDate > this._eventSource.getLatestDate()) {
            band.scrollToCenter(this._eventSource.getLatestDate());
        }
    }
    this._dom.setUnplottableMessage(currentSize, unplottableItems);
};

Exhibit.TimelineView.prototype._fillInfoBubble = function(evt, elmt, theme, labeller) {
    this._uiContext.getLensRegistry().createLens(evt._itemID, elmt, this._uiContext);
};
