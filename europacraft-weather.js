"use strict";

/*
    ========================================================================
    EUROPACRAFT WEATHER PLANNER
    FILE 3 OF 3
    europacraft-weather.js
    ========================================================================

    DESIGN

    This is NOT a numerical weather model.

    It is a deterministic weather-authoring engine:

        climatology
            +
        manually placed weather systems
            +
        deterministic interpolation
            =
        final EuropaCraft weather

    No:
    - APIs
    - randomness
    - atmospheric simulation
    - fluid dynamics
    - hidden procedural weather
    - dependency on old EuropaCraft climate files

    Everything visible in the final weather is ultimately caused by:
    - climatology
    - authored highs/lows
    - authored air masses
    - authored fronts
    - authored precipitation areas
    - explicit overrides

    ========================================================================
*/


(function () {

    "use strict";


    /* =====================================================================
       BOOT CHECK
       ===================================================================== */

    if (!window.EuropaWeatherPlan) {

        throw new Error(
            "EuropaCraft Weather Planner could not start because " +
            "europacraft-weather-plan.js was not loaded."
        );
    }


    const PLAN =
        window.EuropaWeatherPlan;


    const ENGINE_VERSION =
        "1.0-deterministic";


    const STORAGE_KEY =
        "europacraft-weather-planner-v1";


    const MS_MINUTE =
        60 * 1000;


    const MS_HOUR =
        60 * MS_MINUTE;


    const MS_DAY =
        24 * MS_HOUR;


    const EARTH_KM_PER_DEGREE =
        111.32;


    /*
        A copy of the file-defined plan before local working data is loaded.
        Reset returns to this.
    */
    const ORIGINAL_FILE_PLAN =
        deepCopy(
            PLAN.toSerializable()
        );


    /* =====================================================================
       COHERENT EUROPE LAND / SEA MASK
       =====================================================================

       These are deterministic simplified geographical polygons.

       They are NOT random procedural coastlines.

       The mask is deliberately lower-detail than the actual EuropaCraft map,
       because its purpose here is meteorological planning, not replacing the
       Minecraft terrain map.

       Coordinates are:
           [longitude, latitude]

       Several polygons overlap intentionally. That prevents artificial gaps
       between adjoining European regions.

       The final server implementation can later replace this simplified mask
       with an exact EuropaCraft raster mask without changing the weather-plan
       architecture.
       ===================================================================== */


    const LAND_POLYGONS = [

        /*
            IBERIAN PENINSULA
        */
        [
            [-9.55, 43.00],
            [-8.80, 43.70],
            [-7.00, 43.75],
            [-5.20, 43.65],
            [-3.00, 43.45],
            [-1.75, 43.20],
            [-1.50, 42.40],
            [0.20, 41.20],
            [1.60, 41.00],
            [3.30, 42.25],
            [3.15, 41.30],
            [2.50, 40.20],
            [1.10, 39.00],
            [0.20, 38.60],
            [-0.20, 37.60],
            [-1.50, 36.80],
            [-3.20, 36.70],
            [-5.35, 36.05],
            [-6.20, 36.40],
            [-7.20, 37.10],
            [-7.45, 38.50],
            [-8.75, 39.00],
            [-9.20, 40.20],
            [-9.55, 41.70],
            [-9.55, 43.00]
        ],


        /*
            FRANCE / BENELUX / GERMANY / CENTRAL EUROPE / POLAND
            Broad continuous central-European land mass.
        */
        [
            [-5.20, 48.70],
            [-4.80, 47.60],
            [-2.20, 46.60],
            [-1.60, 45.00],
            [0.20, 43.20],
            [2.00, 42.60],
            [3.30, 43.30],
            [5.20, 43.00],
            [6.60, 43.50],
            [7.50, 44.00],
            [8.20, 45.10],
            [9.20, 45.40],
            [10.70, 45.80],
            [12.50, 45.70],
            [13.80, 46.30],
            [15.10, 46.60],
            [16.90, 47.00],
            [18.00, 47.70],
            [19.70, 48.00],
            [22.00, 48.30],
            [23.90, 49.10],
            [24.20, 50.80],
            [23.50, 52.00],
            [22.80, 54.00],
            [20.70, 54.70],
            [18.40, 54.85],
            [16.50, 54.60],
            [14.50, 54.30],
            [13.20, 54.50],
            [12.00, 54.20],
            [10.80, 54.50],
            [9.60, 54.85],
            [8.50, 54.60],
            [8.00, 53.80],
            [7.10, 53.50],
            [6.30, 53.60],
            [5.20, 53.30],
            [4.40, 52.40],
            [3.60, 51.80],
            [2.60, 51.20],
            [1.80, 50.90],
            [1.30, 50.20],
            [0.50, 49.80],
            [-1.50, 49.70],
            [-3.00, 48.90],
            [-5.20, 48.70]
        ],


        /*
            DENMARK
        */
        [
            [8.00, 54.75],
            [8.50, 55.70],
            [8.20, 56.70],
            [9.20, 57.60],
            [10.60, 57.75],
            [10.80, 56.50],
            [10.20, 55.30],
            [11.20, 54.90],
            [10.30, 54.50],
            [9.10, 54.45],
            [8.00, 54.75]
        ],


        /*
            ITALIAN PENINSULA
        */
        [
            [7.40, 44.10],
            [8.20, 43.70],
            [9.80, 44.00],
            [11.30, 43.80],
            [12.60, 43.10],
            [13.40, 42.40],
            [14.20, 41.90],
            [15.50, 41.20],
            [16.80, 40.20],
            [17.20, 39.20],
            [16.50, 38.80],
            [15.80, 39.60],
            [15.30, 40.60],
            [14.60, 41.20],
            [13.40, 41.20],
            [12.20, 42.20],
            [11.40, 42.60],
            [10.80, 43.30],
            [9.40, 44.20],
            [8.00, 44.60],
            [7.40, 44.10]
        ],


        /*
            BALKANS
        */
        [
            [13.20, 46.80],
            [15.00, 46.90],
            [17.50, 46.70],
            [19.20, 46.00],
            [21.20, 46.30],
            [23.00, 45.50],
            [25.70, 45.30],
            [28.80, 45.50],
            [29.80, 44.60],
            [28.80, 43.40],
            [28.20, 42.30],
            [27.30, 41.70],
            [26.00, 41.20],
            [24.50, 40.80],
            [23.20, 40.20],
            [22.60, 39.20],
            [21.80, 38.70],
            [21.20, 39.50],
            [20.20, 40.00],
            [19.50, 40.70],
            [19.00, 41.50],
            [18.20, 42.50],
            [17.10, 43.00],
            [16.20, 44.00],
            [15.20, 45.20],
            [13.20, 46.80]
        ],


        /*
            GREECE
        */
        [
            [20.00, 40.00],
            [21.00, 40.70],
            [22.30, 40.90],
            [23.50, 41.00],
            [24.60, 40.40],
            [25.30, 39.70],
            [24.70, 38.60],
            [24.00, 37.50],
            [23.20, 36.40],
            [22.00, 36.50],
            [21.20, 37.10],
            [21.00, 38.30],
            [20.30, 39.00],
            [20.00, 40.00]
        ],


        /*
            EASTERN EUROPE / UKRAINE / BELARUS / WESTERN RUSSIA
        */
        [
            [21.00, 48.20],
            [24.00, 47.80],
            [27.00, 47.80],
            [30.00, 46.00],
            [33.50, 46.00],
            [36.00, 47.00],
            [39.00, 47.50],
            [42.00, 49.00],
            [45.00, 50.50],
            [48.00, 52.00],
            [50.00, 55.00],
            [49.00, 58.00],
            [46.00, 60.00],
            [41.00, 60.50],
            [36.00, 59.50],
            [31.00, 57.50],
            [27.50, 56.00],
            [24.00, 55.00],
            [22.50, 53.00],
            [21.00, 48.20]
        ],


        /*
            BALTIC STATES
        */
        [
            [20.80, 54.70],
            [22.00, 55.60],
            [21.00, 56.50],
            [21.50, 57.60],
            [23.30, 58.10],
            [24.50, 59.40],
            [27.80, 59.40],
            [28.20, 57.20],
            [27.00, 55.80],
            [25.50, 54.80],
            [23.60, 54.40],
            [20.80, 54.70]
        ],


        /*
            SCANDINAVIA
        */
        [
            [5.00, 58.00],
            [5.30, 60.50],
            [4.80, 62.00],
            [6.00, 64.00],
            [8.00, 66.00],
            [11.00, 68.00],
            [14.00, 69.50],
            [18.00, 70.50],
            [22.00, 71.20],
            [27.00, 70.80],
            [29.50, 69.00],
            [27.00, 67.00],
            [24.00, 65.50],
            [22.00, 63.00],
            [19.00, 60.00],
            [17.00, 58.20],
            [15.00, 56.00],
            [12.50, 55.20],
            [11.00, 56.50],
            [9.50, 57.50],
            [7.50, 58.00],
            [5.00, 58.00]
        ],


        /*
            FINLAND
        */
        [
            [20.00, 59.50],
            [23.00, 59.70],
            [26.00, 60.00],
            [29.00, 61.00],
            [31.00, 63.00],
            [31.00, 66.00],
            [29.00, 68.50],
            [26.00, 69.50],
            [23.00, 68.50],
            [21.00, 66.00],
            [20.00, 63.00],
            [20.00, 59.50]
        ],


        /*
            GREAT BRITAIN
        */
        [
            [-5.80, 50.00],
            [-4.00, 50.10],
            [-2.80, 50.50],
            [-1.20, 50.80],
            [0.80, 51.00],
            [1.50, 52.00],
            [1.20, 53.20],
            [0.00, 53.80],
            [-1.00, 54.70],
            [-2.00, 55.80],
            [-1.20, 57.00],
            [-2.00, 58.50],
            [-3.80, 58.70],
            [-5.20, 57.80],
            [-5.80, 56.60],
            [-5.30, 55.50],
            [-4.50, 54.80],
            [-3.20, 54.00],
            [-4.80, 53.40],
            [-5.30, 52.00],
            [-5.80, 50.00]
        ],


        /*
            IRELAND
        */
        [
            [-10.60, 51.40],
            [-9.00, 51.30],
            [-7.20, 52.00],
            [-6.00, 53.20],
            [-6.10, 54.60],
            [-7.20, 55.30],
            [-9.00, 55.10],
            [-10.20, 54.00],
            [-10.60, 52.50],
            [-10.60, 51.40]
        ],


        /*
            ICELAND
        */
        [
            [-24.70, 63.30],
            [-22.00, 63.20],
            [-19.00, 63.40],
            [-16.00, 64.00],
            [-13.60, 65.20],
            [-14.20, 66.30],
            [-17.00, 66.50],
            [-20.00, 66.20],
            [-23.00, 66.00],
            [-24.70, 64.80],
            [-24.70, 63.30]
        ],


        /*
            SICILY
        */
        [
            [12.30, 38.10],
            [13.80, 38.30],
            [15.50, 38.10],
            [15.60, 37.10],
            [14.50, 36.70],
            [13.00, 37.00],
            [12.30, 38.10]
        ],


        /*
            SARDINIA
        */
        [
            [8.00, 41.20],
            [9.50, 41.20],
            [9.80, 39.00],
            [9.30, 38.80],
            [8.40, 39.20],
            [8.00, 41.20]
        ],


        /*
            CORSICA
        */
        [
            [8.50, 43.10],
            [9.60, 43.00],
            [9.60, 41.30],
            [8.80, 41.30],
            [8.50, 43.10]
        ],


        /*
            CRETE
        */
        [
            [23.20, 35.70],
            [26.40, 35.50],
            [26.20, 34.90],
            [23.30, 34.90],
            [23.20, 35.70]
        ],


        /*
            CYPRUS
        */
        [
            [32.20, 35.70],
            [34.70, 35.70],
            [34.70, 34.50],
            [32.20, 34.50],
            [32.20, 35.70]
        ],


        /*
            WESTERN / NORTHERN TURKEY
        */
        [
            [26.00, 41.70],
            [29.00, 41.30],
            [32.00, 41.70],
            [36.00, 42.00],
            [40.00, 41.00],
            [43.50, 40.00],
            [44.00, 38.00],
            [42.00, 36.50],
            [38.00, 36.00],
            [34.00, 36.00],
            [30.00, 36.30],
            [27.00, 37.00],
            [26.00, 39.00],
            [26.00, 41.70]
        ]
    ];


    /* =====================================================================
       DOM
       ===================================================================== */

    const canvas =
        document.getElementById("weatherMap");


    const ctx =
        canvas.getContext("2d");


    const el = {

        currentTime:
            document.getElementById("ec-current-time"),

        planRange:
            document.getElementById("ec-plan-range"),

        lockState:
            document.getElementById("ec-lock-state"),

        mapHelp:
            document.getElementById("ec-map-help"),

        mapCoordinates:
            document.getElementById("ec-map-coordinates"),

        timeSlider:
            document.getElementById("ec-time-slider"),

        timeInput:
            document.getElementById("ec-time-input"),

        timelineStart:
            document.getElementById("ec-timeline-start"),

        timelineMiddle:
            document.getElementById("ec-timeline-middle"),

        timelineEnd:
            document.getElementById("ec-timeline-end"),

        timelineNote:
            document.getElementById("ec-timeline-note"),

        minus6h:
            document.getElementById("ec-minus-6h"),

        minus1h:
            document.getElementById("ec-minus-1h"),

        plus1h:
            document.getElementById("ec-plus-1h"),

        plus6h:
            document.getElementById("ec-plus-6h"),

        deleteSelected:
            document.getElementById("ec-delete-selected"),

        duplicateSelected:
            document.getElementById("ec-duplicate-selected"),

        inspectedLocation:
            document.getElementById("ec-inspected-location"),

        wxTemp:
            document.getElementById("wx-temp"),

        wxPressure:
            document.getElementById("wx-pressure"),

        wxWind:
            document.getElementById("wx-wind"),

        wxCloud:
            document.getElementById("wx-cloud"),

        wxPrecip:
            document.getElementById("wx-precip"),

        wxSnow:
            document.getElementById("wx-snow"),

        wxSurface:
            document.getElementById("wx-surface"),

        objectList:
            document.getElementById("ec-object-list"),

        selectedEmpty:
            document.getElementById("ec-selected-empty"),

        selectedEditor:
            document.getElementById("ec-selected-editor"),

        lockedObjectNote:
            document.getElementById("ec-locked-object-note"),

        objName:
            document.getElementById("obj-name"),

        objType:
            document.getElementById("obj-type"),

        objStartTime:
            document.getElementById("obj-start-time"),

        objEndTime:
            document.getElementById("obj-end-time"),

        objStartLat:
            document.getElementById("obj-start-lat"),

        objStartLon:
            document.getElementById("obj-start-lon"),

        objEndLat:
            document.getElementById("obj-end-lat"),

        objEndLon:
            document.getElementById("obj-end-lon"),

        objStrength:
            document.getElementById("obj-strength"),

        objRadius:
            document.getElementById("obj-radius"),

        objAirmass:
            document.getElementById("obj-airmass"),

        objAngle:
            document.getElementById("obj-angle"),

        objLength:
            document.getElementById("obj-length"),

        objPrecipMode:
            document.getElementById("obj-precip-mode"),

        objPrecipRate:
            document.getElementById("obj-precip-rate"),

        objCloud:
            document.getElementById("obj-cloud"),

        objNotes:
            document.getElementById("obj-notes"),

        fieldAirmass:
            document.getElementById("field-airmass"),

        fieldFront:
            document.getElementById("field-front"),

        fieldPrecip:
            document.getElementById("field-precip"),

        fieldStrength:
            document.getElementById("field-strength"),

        fieldRadius:
            document.getElementById("field-radius"),

        markDone:
            document.getElementById("ec-mark-done"),

        lockThrough:
            document.getElementById("ec-lock-through"),

        saveLocal:
            document.getElementById("ec-save-local"),

        exportPlan:
            document.getElementById("ec-export-plan"),

        exportServer:
            document.getElementById("ec-export-server"),

        resetPlan:
            document.getElementById("ec-reset-plan"),

        status:
            document.getElementById("ec-status-message")
    };


    /* =====================================================================
       STATE
       ===================================================================== */

    const state = {

        tool: "inspect",

        currentTime:
            Date.parse(
                PLAN.planningBlock.start
            ),

        selectedObjectId:
            null,

        inspectedPoint: {
            lat: 53.5,
            lon: 15.0
        },

        displayStart: 0,
        displayEnd: 0,

        dirty: false,

        drawingWidth: 0,
        drawingHeight: 0,

        dpr: 1
    };


    /* =====================================================================
       GENERIC HELPERS
       ===================================================================== */

    function clamp(value, min, max) {

        value =
            Number(value);

        if (!Number.isFinite(value)) {
            return min;
        }

        return Math.max(
            min,
            Math.min(
                max,
                value
            )
        );
    }


    function lerp(a, b, t) {

        return a +
            (b - a) * t;
    }


    function smoothstep(t) {

        t =
            clamp(t, 0, 1);

        return t * t * (3 - 2 * t);
    }


    function deepCopy(value) {

        return JSON.parse(
            JSON.stringify(value)
        );
    }


    function degToRad(deg) {

        return deg *
            Math.PI /
            180;
    }


    function radToDeg(rad) {

        return rad *
            180 /
            Math.PI;
    }


    function normalizeDegrees(value) {

        value =
            value % 360;

        if (value < 0) {
            value += 360;
        }

        return value;
    }


    function pad2(value) {

        return String(value)
            .padStart(2, "0");
    }


    function formatDateTimeUTC(ms) {

        const d =
            new Date(ms);

        return (
            d.getUTCFullYear() +
            "-" +
            pad2(d.getUTCMonth() + 1) +
            "-" +
            pad2(d.getUTCDate()) +
            " " +
            pad2(d.getUTCHours()) +
            ":" +
            pad2(d.getUTCMinutes()) +
            " UTC"
        );
    }


    function formatShortUTC(ms) {

        const d =
            new Date(ms);

        return (
            pad2(d.getUTCDate()) +
            " " +
            monthShort(d.getUTCMonth()) +
            " " +
            pad2(d.getUTCHours()) +
            ":" +
            pad2(d.getUTCMinutes())
        );
    }


    function monthShort(index) {

        return [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec"
        ][index];
    }


    function toDateTimeLocalValue(ms) {

        const d =
            new Date(ms);

        return (
            d.getUTCFullYear() +
            "-" +
            pad2(d.getUTCMonth() + 1) +
            "-" +
            pad2(d.getUTCDate()) +
            "T" +
            pad2(d.getUTCHours()) +
            ":" +
            pad2(d.getUTCMinutes())
        );
    }


    function parseDateTimeLocalAsUTC(value) {

        if (!value) {
            return NaN;
        }

        const match =
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
                .exec(value);

        if (!match) {
            return NaN;
        }

        return Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            0,
            0
        );
    }


    function dayOfYearUTC(ms) {

        const d =
            new Date(ms);

        const start =
            Date.UTC(
                d.getUTCFullYear(),
                0,
                1
            );

        return Math.floor(
            (ms - start) /
            MS_DAY
        ) + 1;
    }


    function statusMessage(text, strong) {

        if (!el.status) {
            return;
        }

        if (strong) {

            el.status.innerHTML =
                "<strong>" +
                escapeHTML(strong) +
                "</strong> " +
                escapeHTML(text);
        }
        else {

            el.status.textContent =
                text;
        }
    }


    function escapeHTML(text) {

        return String(text)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    /* =====================================================================
       GEOGRAPHY
       ===================================================================== */

    function pointInPolygon(
        lon,
        lat,
        polygon
    ) {

        let inside = false;

        for (
            let i = 0, j = polygon.length - 1;
            i < polygon.length;
            j = i++
        ) {

            const xi =
                polygon[i][0];

            const yi =
                polygon[i][1];

            const xj =
                polygon[j][0];

            const yj =
                polygon[j][1];


            const intersects =
                (
                    (yi > lat) !==
                    (yj > lat)
                ) &&
                (
                    lon <
                    (
                        (xj - xi) *
                        (lat - yi) /
                        ((yj - yi) || 1e-9)
                    ) +
                    xi
                );


            if (intersects) {
                inside = !inside;
            }
        }

        return inside;
    }


    function isLand(lat, lon) {

        for (const polygon of LAND_POLYGONS) {

            if (
                pointInPolygon(
                    lon,
                    lat,
                    polygon
                )
            ) {
                return true;
            }
        }

        return false;
    }


    function kmPerLonDegree(lat) {

        return (
            EARTH_KM_PER_DEGREE *
            Math.cos(
                degToRad(lat)
            )
        );
    }


    function distanceKm(
        lat1,
        lon1,
        lat2,
        lon2
    ) {

        const meanLat =
            (lat1 + lat2) / 2;

        const dx =
            (lon2 - lon1) *
            kmPerLonDegree(meanLat);

        const dy =
            (lat2 - lat1) *
            EARTH_KM_PER_DEGREE;

        return Math.sqrt(
            dx * dx +
            dy * dy
        );
    }


    function localVectorKm(
        fromLat,
        fromLon,
        toLat,
        toLon
    ) {

        const meanLat =
            (fromLat + toLat) / 2;

        return {
            x:
                (toLon - fromLon) *
                kmPerLonDegree(meanLat),

            y:
                (toLat - fromLat) *
                EARTH_KM_PER_DEGREE
        };
    }


    /* =====================================================================
       MAP PROJECTION
       ===================================================================== */

    function lonToX(lon) {

        const b =
            PLAN.bounds;

        return (
            (lon - b.west) /
            (b.east - b.west) *
            state.drawingWidth
        );
    }


    function latToY(lat) {

        const b =
            PLAN.bounds;

        return (
            (b.north - lat) /
            (b.north - b.south) *
            state.drawingHeight
        );
    }


    function xToLon(x) {

        const b =
            PLAN.bounds;

        return (
            b.west +
            x /
            state.drawingWidth *
            (b.east - b.west)
        );
    }


    function yToLat(y) {

        const b =
            PLAN.bounds;

        return (
            b.north -
            y /
            state.drawingHeight *
            (b.north - b.south)
        );
    }


    function canvasPointFromEvent(event) {

        const rect =
            canvas.getBoundingClientRect();

        return {
            x:
                (
                    event.clientX -
                    rect.left
                ) *
                state.drawingWidth /
                rect.width,

            y:
                (
                    event.clientY -
                    rect.top
                ) *
                state.drawingHeight /
                rect.height
        };
    }


    /* =====================================================================
       CLIMATOLOGY
       =====================================================================

       This is deliberately compact.

       It is not attempting to reproduce ERA5 point-for-point.

       It gives a coherent European baseline onto which you author the actual
       weather.

       The authored plan is what creates individual warm spells, cold spells,
       Atlantic lows, continental highs, rain bands, snow events, etc.
       ===================================================================== */


    function regionType(lat, lon, land) {

        if (!land) {

            if (
                lat >= 54 &&
                lon >= 10 &&
                lon <= 31
            ) {
                return "baltic_sea";
            }

            if (
                lat < 46 &&
                lon > -6
            ) {
                return "mediterranean_sea";
            }

            return "atlantic_sea";
        }


        if (
            lon <= 2 &&
            lat >= 49 &&
            lat <= 59
        ) {
            return "northwest_maritime";
        }


        if (
            lat >= 58 &&
            lon <= 10
        ) {
            return "northwest_maritime";
        }


        if (
            lat >= 56 &&
            lon >= 10
        ) {
            return "northern";
        }


        if (
            lat <= 45 &&
            lon >= -10 &&
            lon <= 30
        ) {
            return "mediterranean";
        }


        if (
            lon >= 18
        ) {
            return "continental";
        }


        return "central";
    }


    function continentality(lat, lon, land) {

        if (!land) {
            return 0.05;
        }


        const region =
            regionType(
                lat,
                lon,
                land
            );


        if (
            region === "northwest_maritime"
        ) {
            return 0.12;
        }


        if (
            region === "mediterranean"
        ) {
            return clamp(
                0.30 +
                Math.max(
                    0,
                    lon - 5
                ) / 50,
                0.25,
                0.65
            );
        }


        if (
            region === "northern"
        ) {

            return clamp(
                0.30 +
                (lon - 8) / 45,
                0.20,
                0.90
            );
        }


        return clamp(
            (lon + 3) / 32,
            0.12,
            0.95
        );
    }


    function baselineAnnualTemperature(
        lat,
        lon,
        land
    ) {

        if (!land) {

            const region =
                regionType(
                    lat,
                    lon,
                    false
                );

            if (
                region === "mediterranean_sea"
            ) {
                return (
                    19.0 -
                    0.24 *
                    (lat - 35)
                );
            }

            if (
                region === "baltic_sea"
            ) {
                return (
                    9.0 -
                    0.35 *
                    (lat - 55)
                );
            }

            return (
                12.5 -
                0.31 *
                (lat - 50)
            );
        }


        let annual =
            17.2 -
            0.45 *
            (lat - 35);


        const region =
            regionType(
                lat,
                lon,
                true
            );


        if (
            region === "northwest_maritime"
        ) {
            annual += 1.2;
        }


        if (
            region === "mediterranean"
        ) {
            annual += 1.6;
        }


        if (
            region === "continental"
        ) {
            annual -=
                clamp(
                    (lon - 20) * 0.03,
                    0,
                    0.9
                );
        }


        if (
            region === "northern"
        ) {
            annual -= 0.7;
        }


        return annual;
    }


    function seasonalAmplitude(
        lat,
        lon,
        land
    ) {

        if (!land) {

            const region =
                regionType(
                    lat,
                    lon,
                    false
                );

            if (
                region === "baltic_sea"
            ) {
                return 7.5;
            }

            if (
                region === "mediterranean_sea"
            ) {
                return 6.5;
            }

            return 4.8;
        }


        const c =
            continentality(
                lat,
                lon,
                true
            );


        return (
            5.8 +
            c * 7.5 +
            Math.max(
                0,
                lat - 47
            ) * 0.07
        );
    }


    function baselineTemperature(
        lat,
        lon,
        ms
    ) {

        const land =
            isLand(
                lat,
                lon
            );


        const doy =
            dayOfYearUTC(ms);


        const annual =
            baselineAnnualTemperature(
                lat,
                lon,
                land
            );


        const amplitude =
            seasonalAmplitude(
                lat,
                lon,
                land
            );


        /*
            Northern Hemisphere climatological maximum roughly late July.

            cos(0) at day ~200.
        */
        const seasonal =
            amplitude *
            Math.cos(
                2 *
                Math.PI *
                (doy - 200) /
                365.2422
            );


        /*
            Local solar hour.

            Longitude affects the diurnal cycle even when civil time zones do
            something politically strange.
        */
        const date =
            new Date(ms);


        const utcHour =
            date.getUTCHours() +
            date.getUTCMinutes() / 60 +
            date.getUTCSeconds() / 3600;


        let solarHour =
            utcHour +
            lon / 15;


        solarHour =
            (
                solarHour %
                24 +
                24
            ) % 24;


        const c =
            continentality(
                lat,
                lon,
                land
            );


        const diurnalAmplitude =
            land
                ? 2.2 + c * 2.4
                : 0.8;


        /*
            Peak at approximately 15:00 local solar time.
        */
        const diurnal =
            diurnalAmplitude *
            Math.cos(
                2 *
                Math.PI *
                (solarHour - 15) /
                24
            );


        return (
            annual +
            seasonal +
            diurnal
        );
    }


    function baselinePressure(
        lat,
        lon,
        ms
    ) {

        const doy =
            dayOfYearUTC(ms);


        const winterFactor =
            (
                1 +
                Math.cos(
                    2 *
                    Math.PI *
                    (doy - 15) /
                    365.2422
                )
            ) / 2;


        /*
            Slight climatological tendency toward lower winter pressure in the
            North Atlantic / northern Europe.

            This is a baseline only. Authored pressure systems dominate.
        */
        const northernStorminess =
            clamp(
                (lat - 45) / 25,
                0,
                1
            ) *
            winterFactor;


        return (
            1015.5 -
            northernStorminess * 3.0
        );
    }


    function baselineCloudCover(
        lat,
        lon,
        ms
    ) {

        const land =
            isLand(
                lat,
                lon
            );


        const region =
            regionType(
                lat,
                lon,
                land
            );


        const doy =
            dayOfYearUTC(ms);


        const winterFactor =
            (
                1 +
                Math.cos(
                    2 *
                    Math.PI *
                    (doy - 15) /
                    365.2422
                )
            ) / 2;


        let cloud;


        switch (region) {

            case "northwest_maritime":
                cloud =
                    54 +
                    18 * winterFactor;
                break;

            case "atlantic_sea":
                cloud =
                    58 +
                    13 * winterFactor;
                break;

            case "baltic_sea":
                cloud =
                    47 +
                    20 * winterFactor;
                break;

            case "mediterranean":
                cloud =
                    28 +
                    22 * winterFactor;
                break;

            case "mediterranean_sea":
                cloud =
                    25 +
                    20 * winterFactor;
                break;

            case "continental":
                cloud =
                    38 +
                    20 * winterFactor;
                break;

            case "northern":
                cloud =
                    44 +
                    22 * winterFactor;
                break;

            default:
                cloud =
                    42 +
                    20 * winterFactor;
                break;
        }


        return clamp(
            cloud,
            0,
            100
        );
    }


    /* =====================================================================
       WEATHER OBJECT TIME / MOVEMENT
       ===================================================================== */

    function objectTimes(object) {

        return {
            start:
                Date.parse(
                    object.startTime
                ),

            end:
                Date.parse(
                    object.endTime
                )
        };
    }


    function objectActiveAt(
        object,
        ms
    ) {

        const times =
            objectTimes(object);


        return (
            Number.isFinite(times.start) &&
            Number.isFinite(times.end) &&
            ms >= times.start &&
            ms <= times.end
        );
    }


    function objectProgress(
        object,
        ms
    ) {

        const times =
            objectTimes(object);


        if (
            !Number.isFinite(times.start) ||
            !Number.isFinite(times.end) ||
            times.end <= times.start
        ) {
            return 0;
        }


        let t =
            (
                ms -
                times.start
            ) /
            (
                times.end -
                times.start
            );


        t =
            clamp(
                t,
                0,
                1
            );


        if (
            PLAN.settings
                .movementInterpolation ===
            "linear"
        ) {
            return t;
        }


        return smoothstep(t);
    }


    function objectPosition(
        object,
        ms
    ) {

        const t =
            objectProgress(
                object,
                ms
            );


        return {
            lat:
                lerp(
                    object.start.lat,
                    object.end.lat,
                    t
                ),

            lon:
                lerp(
                    object.start.lon,
                    object.end.lon,
                    t
                )
        };
    }


    function radialWeight(
        distance,
        radius
    ) {

        radius =
            Math.max(
                1,
                radius
            );


        const x =
            distance /
            radius;


        if (x >= 1) {
            return 0;
        }


        /*
            Smooth, finite influence.

            At the centre:
                1

            At the radius:
                0
        */
        const t =
            1 - x;


        return (
            t *
            t *
            (3 - 2 * t)
        );
    }


    /* =====================================================================
       FRONTS
       ===================================================================== */

    function pointToFrontDistanceKm(
        lat,
        lon,
        object,
        ms
    ) {

        const centre =
            objectPosition(
                object,
                ms
            );


        const angle =
            degToRad(
                Number(
                    object.angle || 0
                )
            );


        const halfLength =
            Number(
                object.lengthKm ||
                700
            ) / 2;


        /*
            Unit vector along the front.
        */
        const ux =
            Math.sin(angle);


        const uy =
            Math.cos(angle);


        const p =
            localVectorKm(
                centre.lat,
                centre.lon,
                lat,
                lon
            );


        const projection =
            clamp(
                p.x * ux +
                p.y * uy,
                -halfLength,
                halfLength
            );


        const closestX =
            ux *
            projection;


        const closestY =
            uy *
            projection;


        const dx =
            p.x -
            closestX;


        const dy =
            p.y -
            closestY;


        return Math.sqrt(
            dx * dx +
            dy * dy
        );
    }


    /* =====================================================================
       WEATHER CORE
       ===================================================================== */

    function calculateWeatherCore(
        lat,
        lon,
        ms
    ) {

        lat =
            clamp(
                lat,
                PLAN.bounds.south,
                PLAN.bounds.north
            );


        lon =
            clamp(
                lon,
                PLAN.bounds.west,
                PLAN.bounds.east
            );


        const land =
            isLand(
                lat,
                lon
            );


        let temperature =
            baselineTemperature(
                lat,
                lon,
                ms
            );


        let pressure =
            baselinePressure(
                lat,
                lon,
                ms
            );


        let cloud =
            baselineCloudCover(
                lat,
                lon,
                ms
            );


        let precipRate =
            0;


        let forcedPhase =
            null;


        let moisture =
            land
                ? 0.50
                : 0.72;


        /*
            Baseline westerly airflow.

            This is deliberately modest so authored highs/lows dominate.
        */
        let windX =
            4.0;


        let windY =
            0.0;


        const contributions = [];


        for (
            const object of PLAN.objects
        ) {

            if (
                !objectActiveAt(
                    object,
                    ms
                )
            ) {
                continue;
            }


            const pos =
                objectPosition(
                    object,
                    ms
                );


            const dist =
                distanceKm(
                    lat,
                    lon,
                    pos.lat,
                    pos.lon
                );


            const radius =
                Math.max(
                    20,
                    Number(
                        object.radiusKm ||
                        400
                    )
                );


            const weight =
                radialWeight(
                    dist,
                    radius
                );


            if (
                object.type === "high" ||
                object.type === "low"
            ) {

                if (weight <= 0) {
                    continue;
                }


                const strength =
                    Number(
                        object.strength || 0
                    );


                pressure +=
                    strength *
                    weight;


                if (
                    object.type === "high"
                ) {

                    cloud -=
                        30 *
                        weight;
                }
                else {

                    cloud +=
                        32 *
                        weight;


                    /*
                        Weak broad precipitation tendency around lows.

                        Major precipitation is still better authored with fronts
                        and precipitation areas.
                    */
                    precipRate +=
                        Math.max(
                            0,
                            -strength - 8
                        ) *
                        0.025 *
                        weight *
                        moisture;
                }


                /*
                    Circular geostrophic-style airflow.

                    Northern Hemisphere:
                        Low  = counter-clockwise
                        High = clockwise
                */
                const vector =
                    localVectorKm(
                        pos.lat,
                        pos.lon,
                        lat,
                        lon
                    );


                const vectorLength =
                    Math.sqrt(
                        vector.x * vector.x +
                        vector.y * vector.y
                    ) || 1;


                const nx =
                    vector.x /
                    vectorLength;


                const ny =
                    vector.y /
                    vectorLength;


                let tx;
                let ty;


                if (
                    object.type === "low"
                ) {

                    tx =
                        -ny;

                    ty =
                        nx;
                }
                else {

                    tx =
                        ny;

                    ty =
                        -nx;
                }


                const speedContribution =
                    Math.abs(strength) *
                    0.38 *
                    weight;


                windX +=
                    tx *
                    speedContribution;


                windY +=
                    ty *
                    speedContribution;


                /*
                    Small inflow into lows and outflow from highs.
                */
                const radial =
                    speedContribution *
                    0.14;


                if (
                    object.type === "low"
                ) {

                    windX -=
                        nx *
                        radial;

                    windY -=
                        ny *
                        radial;
                }
                else {

                    windX +=
                        nx *
                        radial;

                    windY +=
                        ny *
                        radial;
                }


                contributions.push({
                    id:
                        object.id,

                    type:
                        object.type,

                    weight:
                        weight
                });


                continue;
            }


            if (
                object.type === "airmass"
            ) {

                if (weight <= 0) {
                    continue;
                }


                const anomaly =
                    Number.isFinite(
                        Number(
                            object.temperatureAnomaly
                        )
                    )
                        ? Number(
                            object.temperatureAnomaly
                        )
                        : Number(
                            object.strength || 0
                        );


                temperature +=
                    anomaly *
                    weight;


                const objectMoisture =
                    clamp(
                        Number(
                            object.moisture ??
                            defaultAirmassMoisture(
                                object.airmass
                            )
                        ),
                        0,
                        1
                    );


                moisture =
                    lerp(
                        moisture,
                        objectMoisture,
                        weight * 0.75
                    );


                cloud +=
                    (
                        objectMoisture -
                        0.5
                    ) *
                    50 *
                    weight;


                contributions.push({
                    id:
                        object.id,

                    type:
                        object.type,

                    weight:
                        weight
                });


                continue;
            }


            if (
                object.type === "coldfront" ||
                object.type === "warmfront"
            ) {

                const frontDistance =
                    pointToFrontDistanceKm(
                        lat,
                        lon,
                        object,
                        ms
                    );


                const width =
                    Math.max(
                        20,
                        Number(
                            object.widthKm ||
                            120
                        )
                    );


                const frontWeight =
                    radialWeight(
                        frontDistance,
                        width
                    );


                if (
                    frontWeight <= 0
                ) {
                    continue;
                }


                const contrast =
                    Number(
                        object.temperatureContrast ??
                        object.strength ??
                        4
                    );


                /*
                    Front itself gets only a modest temperature signal.

                    The larger air masses should supply the broad warm/cold
                    sectors.
                */
                temperature +=
                    (
                        object.type ===
                        "warmfront"
                            ? 0.25
                            : -0.25
                    ) *
                    contrast *
                    frontWeight;


                cloud =
                    Math.max(
                        cloud,
                        Number(
                            object.cloudCover ||
                            95
                        ) *
                        frontWeight
                    );


                precipRate +=
                    Number(
                        object.precipitationRate ||
                        2
                    ) *
                    frontWeight;


                moisture =
                    Math.max(
                        moisture,
                        0.78 *
                        frontWeight
                    );


                contributions.push({
                    id:
                        object.id,

                    type:
                        object.type,

                    weight:
                        frontWeight
                });


                continue;
            }


            if (
                object.type === "precip"
            ) {

                if (weight <= 0) {
                    continue;
                }


                const rate =
                    Math.max(
                        0,
                        Number(
                            object.precipitationRate ||
                            object.strength ||
                            0
                        )
                    );


                precipRate +=
                    rate *
                    weight;


                cloud =
                    Math.max(
                        cloud,
                        Number(
                            object.cloudCover ||
                            100
                        ) *
                        weight
                    );


                if (
                    object.precipitationPhase &&
                    object.precipitationPhase !==
                    "auto" &&
                    weight >= 0.35
                ) {

                    forcedPhase =
                        object.precipitationPhase;
                }


                contributions.push({
                    id:
                        object.id,

                    type:
                        object.type,

                    weight:
                        weight
                });
            }
        }


        /*
            Explicit overrides are intentionally simple.

            They are available for future use even though version 1 of the UI
            does not create them.
        */
        for (
            const override of
            PLAN.overrides || []
        ) {

            const start =
                Date.parse(
                    override.startTime
                );


            const end =
                Date.parse(
                    override.endTime
                );


            if (
                !Number.isFinite(start) ||
                !Number.isFinite(end) ||
                ms < start ||
                ms > end
            ) {
                continue;
            }


            const radius =
                Number(
                    override.radiusKm ||
                    100
                );


            const dist =
                distanceKm(
                    lat,
                    lon,
                    Number(
                        override.lat
                    ),
                    Number(
                        override.lon
                    )
                );


            const weight =
                radialWeight(
                    dist,
                    radius
                );


            if (weight <= 0) {
                continue;
            }


            if (
                Number.isFinite(
                    Number(
                        override.temperature
                    )
                )
            ) {

                temperature =
                    lerp(
                        temperature,
                        Number(
                            override.temperature
                        ),
                        weight
                    );
            }


            if (
                Number.isFinite(
                    Number(
                        override.pressure
                    )
                )
            ) {

                pressure =
                    lerp(
                        pressure,
                        Number(
                            override.pressure
                        ),
                        weight
                    );
            }


            if (
                Number.isFinite(
                    Number(
                        override.cloudCover
                    )
                )
            ) {

                cloud =
                    lerp(
                        cloud,
                        Number(
                            override.cloudCover
                        ),
                        weight
                    );
            }


            if (
                Number.isFinite(
                    Number(
                        override.precipitationRate
                    )
                )
            ) {

                precipRate =
                    lerp(
                        precipRate,
                        Number(
                            override.precipitationRate
                        ),
                        weight
                    );
            }


            if (
                override.precipitationPhase &&
                weight > 0.5
            ) {

                forcedPhase =
                    override.precipitationPhase;
            }
        }


        cloud =
            clamp(
                cloud,
                0,
                100
            );


        precipRate =
            Math.max(
                0,
                precipRate
            );


        /*
            Very light derived drizzle from extremely cloudy low-pressure air.

            This remains deterministic and modest.
        */
        if (
            precipRate < 0.05 &&
            cloud >= 92 &&
            pressure <= 1003 &&
            moisture >= 0.72
        ) {

            precipRate =
                0.15 +
                (
                    1003 -
                    pressure
                ) *
                0.025;
        }


        let precipPhase =
            "none";


        if (
            precipRate >= 0.05
        ) {

            precipPhase =
                forcedPhase ||
                automaticPrecipitationPhase(
                    temperature
                );
        }


        const windSpeed =
            Math.sqrt(
                windX * windX +
                windY * windY
            );


        /*
            Meteorological direction:
            direction FROM which the wind comes.

            Vector points toward movement, so add 180 degrees.
        */
        const windToward =
            normalizeDegrees(
                radToDeg(
                    Math.atan2(
                        windX,
                        windY
                    )
                )
            );


        const windFrom =
            normalizeDegrees(
                windToward +
                180
            );


        const frozenGround =
            (
                temperature <= -0.5
            );


        return {

            lat:
                lat,

            lon:
                lon,

            time:
                new Date(ms).toISOString(),

            land:
                land,

            region:
                regionType(
                    lat,
                    lon,
                    land
                ),

            temperatureC:
                temperature,

            pressureHpa:
                pressure,

            humidityIndex:
                clamp(
                    moisture,
                    0,
                    1
                ),

            cloudCoverPercent:
                cloud,

            precipitationRateMmH:
                precipRate,

            precipitationPhase:
                precipPhase,

            windSpeedMs:
                windSpeed,

            windDirectionDeg:
                windFrom,

            groundFrozen:
                frozenGround,

            contributions:
                contributions
        };
    }


    function defaultAirmassMoisture(type) {

        switch (type) {

            case "arctic":
                return 0.30;

            case "polar_maritime":
                return 0.78;

            case "atlantic":
                return 0.82;

            case "continental":
                return 0.30;

            case "mediterranean":
                return 0.68;

            case "tropical":
                return 0.28;

            default:
                return 0.55;
        }
    }


    function automaticPrecipitationPhase(
        temperature
    ) {

        if (
            temperature <= -0.4
        ) {
            return "snow";
        }


        if (
            temperature <= 0.8
        ) {
            return "wet_snow";
        }


        if (
            temperature <= 2.2
        ) {
            return "sleet";
        }


        return "rain";
    }


    /* =====================================================================
       SNOW ACCUMULATION
       =====================================================================

       Instant random-access snow depth.

       The planner does NOT have to simulate from October 1 to January 10.

       When a location is inspected, the engine looks backwards through a
       bounded period and deterministically integrates snowfall and melt.

       This makes arbitrary date jumping practical.
       ===================================================================== */

    function calculateSnowDepthCm(
        lat,
        lon,
        ms
    ) {

        if (
            !PLAN.settings
                .snowAccumulationEnabled
        ) {
            return 0;
        }


        if (
            !isLand(
                lat,
                lon
            )
        ) {
            return 0;
        }


        /*
            Thirty days is long enough for almost all lowland snow history.

            Very persistent mountain snow can later be handled through terrain
            elevation / explicit snow-state data.
        */
        const lookback =
            30 *
            MS_DAY;


        const step =
            3 *
            MS_HOUR;


        const start =
            ms -
            lookback;


        let snow =
            0;


        for (
            let t = start;
            t <= ms;
            t += step
        ) {

            const wx =
                calculateWeatherCore(
                    lat,
                    lon,
                    t
                );


            const hours =
                Math.min(
                    step,
                    Math.max(
                        0,
                        ms -
                        t
                    )
                ) /
                MS_HOUR || 3;


            if (
                wx.precipitationRateMmH >
                0
            ) {

                const amountMm =
                    wx.precipitationRateMmH *
                    hours;


                if (
                    wx.precipitationPhase ===
                    "snow"
                ) {

                    snow +=
                        amountMm *
                        0.95;
                }


                if (
                    wx.precipitationPhase ===
                    "wet_snow"
                ) {

                    snow +=
                        amountMm *
                        0.58;
                }


                if (
                    wx.precipitationPhase ===
                    "sleet"
                ) {

                    snow +=
                        amountMm *
                        0.18;
                }


                if (
                    wx.precipitationPhase ===
                    "rain" &&
                    snow > 0
                ) {

                    snow -=
                        amountMm *
                        0.20;
                }
            }


            /*
                Temperature-driven melt.

                Melt accelerates sharply in mild weather.
            */
            if (
                wx.temperatureC >
                0
            ) {

                const meltPerHour =
                    0.035 *
                    wx.temperatureC +
                    0.003 *
                    wx.temperatureC *
                    wx.temperatureC;


                snow -=
                    meltPerHour *
                    hours;
            }


            /*
                Compaction / sublimation.

                Even continuously cold snow slowly settles.
            */
            snow *=
                Math.pow(
                    0.999,
                    hours
                );


            snow =
                Math.max(
                    0,
                    snow
                );
        }


        return Math.min(
            snow,
            500
        );
    }


    function calculateWeather(
        lat,
        lon,
        ms,
        includeSnow
    ) {

        const weather =
            calculateWeatherCore(
                lat,
                lon,
                ms
            );


        let snowDepth =
            0;


        if (
            includeSnow !== false
        ) {

            snowDepth =
                calculateSnowDepthCm(
                    lat,
                    lon,
                    ms
                );
        }


        weather.snowDepthCm =
            snowDepth;


        weather.biomeState =
            determineBiomeState(
                weather
            );


        return weather;
    }


    function determineBiomeState(weather) {

        if (!weather.land) {

            if (
                weather.temperatureC <= -2 &&
                weather.lat >= 58
            ) {
                return "cold_sea";
            }

            return "sea";
        }


        if (
            weather.snowDepthCm >= 2
        ) {
            return "snow_covered";
        }


        if (
            weather.groundFrozen
        ) {
            return "frozen_ground";
        }


        if (
            weather.precipitationRateMmH >= 0.5
        ) {
            return "wet";
        }


        if (
            weather.temperatureC >= 25
        ) {
            return "hot";
        }


        return "normal";
    }


    /* =====================================================================
       MAP RENDERING
       ===================================================================== */

    function resizeCanvas() {

        const rect =
            canvas.getBoundingClientRect();


        state.dpr =
            Math.max(
                1,
                Math.min(
                    2,
                    window.devicePixelRatio ||
                    1
                )
            );


        state.drawingWidth =
            Math.max(
                300,
                Math.round(
                    rect.width
                )
            );


        state.drawingHeight =
            Math.max(
                300,
                Math.round(
                    rect.height
                )
            );


        canvas.width =
            Math.round(
                state.drawingWidth *
                state.dpr
            );


        canvas.height =
            Math.round(
                state.drawingHeight *
                state.dpr
            );


        ctx.setTransform(
            state.dpr,
            0,
            0,
            state.dpr,
            0,
            0
        );


        render();
    }


    function render() {

        drawBaseMap();

        drawGraticule();

        drawWeatherObjects();

        drawInspectionMarker();
    }


    function drawBaseMap() {

        ctx.clearRect(
            0,
            0,
            state.drawingWidth,
            state.drawingHeight
        );


        /*
            Sea
        */
        ctx.fillStyle =
            "#153142";

        ctx.fillRect(
            0,
            0,
            state.drawingWidth,
            state.drawingHeight
        );


        /*
            Land
        */
        ctx.fillStyle =
            "#465943";

        ctx.strokeStyle =
            "#8a9b89";

        ctx.lineWidth =
            1.0;


        for (
            const polygon of
            LAND_POLYGONS
        ) {

            ctx.beginPath();


            for (
                let i = 0;
                i < polygon.length;
                i++
            ) {

                const x =
                    lonToX(
                        polygon[i][0]
                    );


                const y =
                    latToY(
                        polygon[i][1]
                    );


                if (i === 0) {

                    ctx.moveTo(
                        x,
                        y
                    );
                }
                else {

                    ctx.lineTo(
                        x,
                        y
                    );
                }
            }


            ctx.closePath();

            ctx.fill();

            ctx.stroke();
        }
    }


    function drawGraticule() {

        ctx.save();


        ctx.strokeStyle =
            "rgba(210,225,235,0.12)";

        ctx.fillStyle =
            "rgba(225,235,242,0.55)";

        ctx.lineWidth =
            1;

        ctx.font =
            "10px sans-serif";


        for (
            let lon = -20;
            lon <= 50;
            lon += 10
        ) {

            const x =
                lonToX(
                    lon
                );


            ctx.beginPath();

            ctx.moveTo(
                x,
                0
            );

            ctx.lineTo(
                x,
                state.drawingHeight
            );

            ctx.stroke();


            ctx.fillText(
                (
                    lon >= 0
                        ? lon + "°E"
                        : Math.abs(lon) + "°W"
                ),
                x + 4,
                13
            );
        }


        for (
            let lat = 30;
            lat <= 70;
            lat += 10
        ) {

            const y =
                latToY(
                    lat
                );


            ctx.beginPath();

            ctx.moveTo(
                0,
                y
            );

            ctx.lineTo(
                state.drawingWidth,
                y
            );

            ctx.stroke();


            ctx.fillText(
                lat + "°N",
                4,
                y - 4
            );
        }


        ctx.restore();
    }


    function drawWeatherObjects() {

        const active =
            PLAN.objects.filter(
                object =>
                    objectActiveAt(
                        object,
                        state.currentTime
                    )
            );


        /*
            Draw broad areas first.
        */
        for (
            const object of
            active
        ) {

            if (
                object.type === "airmass" ||
                object.type === "precip"
            ) {

                drawAreaObject(
                    object
                );
            }
        }


        /*
            Pressure systems.
        */
        for (
            const object of
            active
        ) {

            if (
                object.type === "high" ||
                object.type === "low"
            ) {

                drawPressureObject(
                    object
                );
            }
        }


        /*
            Fronts above everything.
        */
        for (
            const object of
            active
        ) {

            if (
                object.type === "coldfront" ||
                object.type === "warmfront"
            ) {

                drawFrontObject(
                    object
                );
            }
        }
    }


    function drawAreaObject(object) {

        const pos =
            objectPosition(
                object,
                state.currentTime
            );


        const x =
            lonToX(
                pos.lon
            );


        const y =
            latToY(
                pos.lat
            );


        const radiusLonDeg =
            Number(
                object.radiusKm ||
                400
            ) /
            Math.max(
                20,
                kmPerLonDegree(
                    pos.lat
                )
            );


        const radiusLatDeg =
            Number(
                object.radiusKm ||
                400
            ) /
            EARTH_KM_PER_DEGREE;


        const rx =
            Math.abs(
                lonToX(
                    pos.lon +
                    radiusLonDeg
                ) -
                x
            );


        const ry =
            Math.abs(
                latToY(
                    pos.lat +
                    radiusLatDeg
                ) -
                y
            );


        ctx.save();


        if (
            object.type === "precip"
        ) {

            ctx.fillStyle =
                "rgba(89, 152, 210, 0.24)";

            ctx.strokeStyle =
                "rgba(135, 195, 242, 0.92)";
        }
        else {

            ctx.fillStyle =
                airmassFill(
                    object.airmass
                );

            ctx.strokeStyle =
                airmassStroke(
                    object.airmass
                );
        }


        ctx.lineWidth =
            selectedLineWidth(
                object
            );


        ctx.beginPath();

        ctx.ellipse(
            x,
            y,
            Math.max(
                8,
                rx
            ),
            Math.max(
                8,
                ry *
                (
                    object.type ===
                    "precip"
                        ? Number(
                            object.axisRatio ||
                            0.7
                        )
                        : 1
                )
            ),
            degToRad(
                Number(
                    object.angle ||
                    0
                )
            ),
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.stroke();


        ctx.fillStyle =
            "#eef5f8";

        ctx.font =
            selectedFont(
                object
            );

        ctx.textAlign =
            "center";


        ctx.fillText(
            object.name ||
            object.type,
            x,
            y
        );


        drawMotionArrow(
            object,
            x,
            y
        );


        ctx.restore();
    }


    function airmassFill(type) {

        switch (type) {

            case "arctic":
                return "rgba(165,218,245,0.22)";

            case "polar_maritime":
                return "rgba(124,190,228,0.22)";

            case "atlantic":
                return "rgba(101,171,214,0.20)";

            case "continental":
                return "rgba(190,188,145,0.18)";

            case "mediterranean":
                return "rgba(222,171,105,0.20)";

            case "tropical":
                return "rgba(231,145,76,0.20)";

            default:
                return "rgba(190,205,215,0.18)";
        }
    }


    function airmassStroke(type) {

        switch (type) {

            case "arctic":
                return "rgba(190,230,250,0.92)";

            case "polar_maritime":
                return "rgba(145,205,240,0.92)";

            case "atlantic":
                return "rgba(113,184,230,0.92)";

            case "continental":
                return "rgba(214,207,154,0.92)";

            case "mediterranean":
                return "rgba(236,188,120,0.92)";

            case "tropical":
                return "rgba(241,157,90,0.92)";

            default:
                return "rgba(210,220,226,0.92)";
        }
    }


    function drawPressureObject(
        object
    ) {

        const pos =
            objectPosition(
                object,
                state.currentTime
            );


        const x =
            lonToX(
                pos.lon
            );


        const y =
            latToY(
                pos.lat
            );


        ctx.save();


        ctx.textAlign =
            "center";

        ctx.textBaseline =
            "middle";


        const isHigh =
            object.type ===
            "high";


        ctx.strokeStyle =
            isHigh
                ? "#8ed0f0"
                : "#e89696";


        ctx.fillStyle =
            "rgba(13,18,24,0.82)";


        ctx.lineWidth =
            selectedLineWidth(
                object
            );


        const radius =
            state.selectedObjectId ===
            object.id
                ? 24
                : 20;


        ctx.beginPath();

        ctx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.stroke();


        ctx.fillStyle =
            isHigh
                ? "#a9ddf4"
                : "#f2aaaa";


        ctx.font =
            "bold 22px sans-serif";


        ctx.fillText(
            isHigh
                ? "H"
                : "L",
            x,
            y - 2
        );


        const pressure =
            Math.round(
                1012 +
                Number(
                    object.strength ||
                    0
                )
            );


        ctx.font =
            "10px sans-serif";

        ctx.fillStyle =
            "#e8eef2";


        ctx.fillText(
            pressure + " hPa",
            x,
            y + 29
        );


        drawMotionArrow(
            object,
            x,
            y
        );


        ctx.restore();
    }


    function drawFrontObject(
        object
    ) {

        const centre =
            objectPosition(
                object,
                state.currentTime
            );


        const angle =
            degToRad(
                Number(
                    object.angle ||
                    0
                )
            );


        const halfLength =
            Number(
                object.lengthKm ||
                700
            ) /
            2;


        const ux =
            Math.sin(angle);


        const uy =
            Math.cos(angle);


        const latKm =
            EARTH_KM_PER_DEGREE;


        const lonKm =
            kmPerLonDegree(
                centre.lat
            );


        const start =
            {
                lat:
                    centre.lat -
                    uy *
                    halfLength /
                    latKm,

                lon:
                    centre.lon -
                    ux *
                    halfLength /
                    lonKm
            };


        const end =
            {
                lat:
                    centre.lat +
                    uy *
                    halfLength /
                    latKm,

                lon:
                    centre.lon +
                    ux *
                    halfLength /
                    lonKm
            };


        const x1 =
            lonToX(
                start.lon
            );


        const y1 =
            latToY(
                start.lat
            );


        const x2 =
            lonToX(
                end.lon
            );


        const y2 =
            latToY(
                end.lat
            );


        ctx.save();


        ctx.strokeStyle =
            object.type ===
            "coldfront"
                ? "#69aef5"
                : "#e77d82";


        ctx.fillStyle =
            ctx.strokeStyle;


        ctx.lineWidth =
            selectedLineWidth(
                object
            ) + 1;


        ctx.beginPath();

        ctx.moveTo(
            x1,
            y1
        );

        ctx.lineTo(
            x2,
            y2
        );

        ctx.stroke();


        const screenDx =
            x2 - x1;


        const screenDy =
            y2 - y1;


        const screenLength =
            Math.sqrt(
                screenDx * screenDx +
                screenDy * screenDy
            );


        if (
            screenLength >
            1
        ) {

            const nx =
                screenDx /
                screenLength;


            const ny =
                screenDy /
                screenLength;


            const px =
                -ny;


            const py =
                nx;


            const spacing =
                28;


            for (
                let d = spacing;
                d < screenLength - spacing;
                d += spacing
            ) {

                const cx =
                    x1 +
                    nx * d;


                const cy =
                    y1 +
                    ny * d;


                if (
                    object.type ===
                    "coldfront"
                ) {

                    ctx.beginPath();

                    ctx.moveTo(
                        cx,
                        cy
                    );

                    ctx.lineTo(
                        cx +
                        px * 8 -
                        nx * 5,
                        cy +
                        py * 8 -
                        ny * 5
                    );

                    ctx.lineTo(
                        cx +
                        px * 8 +
                        nx * 5,
                        cy +
                        py * 8 +
                        ny * 5
                    );

                    ctx.closePath();

                    ctx.fill();
                }
                else {

                    ctx.beginPath();

                    ctx.arc(
                        cx +
                        px * 5,
                        cy +
                        py * 5,
                        5,
                        Math.atan2(
                            ny,
                            nx
                        ),
                        Math.atan2(
                            ny,
                            nx
                        ) +
                        Math.PI
                    );

                    ctx.stroke();
                }
            }
        }


        ctx.fillStyle =
            "#f4f6f8";

        ctx.font =
            selectedFont(
                object
            );

        ctx.textAlign =
            "center";


        ctx.fillText(
            object.name,
            lonToX(
                centre.lon
            ),
            latToY(
                centre.lat
            ) - 12
        );


        ctx.restore();
    }


    function drawMotionArrow(
        object,
        startX,
        startY
    ) {

        const dx =
            lonToX(
                object.end.lon
            ) -
            lonToX(
                object.start.lon
            );


        const dy =
            latToY(
                object.end.lat
            ) -
            latToY(
                object.start.lat
            );


        const length =
            Math.sqrt(
                dx * dx +
                dy * dy
            );


        if (
            length < 8
        ) {
            return;
        }


        const ux =
            dx /
            length;


        const uy =
            dy /
            length;


        const arrowLength =
            Math.min(
                38,
                Math.max(
                    18,
                    length * 0.22
                )
            );


        const x2 =
            startX +
            ux *
            arrowLength;


        const y2 =
            startY +
            uy *
            arrowLength;


        ctx.save();


        ctx.strokeStyle =
            "rgba(245,248,250,0.72)";

        ctx.fillStyle =
            "rgba(245,248,250,0.72)";

        ctx.lineWidth =
            1.5;


        ctx.beginPath();

        ctx.moveTo(
            startX,
            startY
        );

        ctx.lineTo(
            x2,
            y2
        );

        ctx.stroke();


        const px =
            -uy;


        const py =
            ux;


        ctx.beginPath();

        ctx.moveTo(
            x2,
            y2
        );

        ctx.lineTo(
            x2 -
            ux * 8 +
            px * 4,
            y2 -
            uy * 8 +
            py * 4
        );

        ctx.lineTo(
            x2 -
            ux * 8 -
            px * 4,
            y2 -
            uy * 8 -
            py * 4
        );

        ctx.closePath();

        ctx.fill();


        ctx.restore();
    }


    function selectedLineWidth(
        object
    ) {

        return (
            state.selectedObjectId ===
            object.id
                ? 3
                : 1.5
        );
    }


    function selectedFont(
        object
    ) {

        return (
            state.selectedObjectId ===
            object.id
                ? "bold 12px sans-serif"
                : "11px sans-serif"
        );
    }


    function drawInspectionMarker() {

        if (
            !state.inspectedPoint
        ) {
            return;
        }


        const x =
            lonToX(
                state.inspectedPoint.lon
            );


        const y =
            latToY(
                state.inspectedPoint.lat
            );


        ctx.save();


        ctx.strokeStyle =
            "#f4d47d";

        ctx.lineWidth =
            1.5;


        ctx.beginPath();

        ctx.arc(
            x,
            y,
            6,
            0,
            Math.PI * 2
        );

        ctx.stroke();


        ctx.beginPath();

        ctx.moveTo(
            x - 10,
            y
        );

        ctx.lineTo(
            x + 10,
            y
        );

        ctx.moveTo(
            x,
            y - 10
        );

        ctx.lineTo(
            x,
            y + 10
        );

        ctx.stroke();


        ctx.restore();
    }


    /* =====================================================================
       MAP INTERACTION
       ===================================================================== */

    function nearestActiveObject(
        x,
        y,
        maxPixels
    ) {

        let best =
            null;


        let bestDistance =
            maxPixels;


        for (
            const object of
            PLAN.objects
        ) {

            if (
                !objectActiveAt(
                    object,
                    state.currentTime
                )
            ) {
                continue;
            }


            const pos =
                objectPosition(
                    object,
                    state.currentTime
                );


            const ox =
                lonToX(
                    pos.lon
                );


            const oy =
                latToY(
                    pos.lat
                );


            const dx =
                ox -
                x;


            const dy =
                oy -
                y;


            const dist =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            if (
                dist <
                bestDistance
            ) {

                bestDistance =
                    dist;

                best =
                    object;
            }
        }


        return best;
    }


    function handleMapClick(event) {

        const p =
            canvasPointFromEvent(
                event
            );


        const lon =
            clamp(
                xToLon(
                    p.x
                ),
                PLAN.bounds.west,
                PLAN.bounds.east
            );


        const lat =
            clamp(
                yToLat(
                    p.y
                ),
                PLAN.bounds.south,
                PLAN.bounds.north
            );


        if (
            state.tool ===
            "inspect"
        ) {

            const nearby =
                nearestActiveObject(
                    p.x,
                    p.y,
                    24
                );


            if (nearby) {

                selectObject(
                    nearby.id
                );
            }
            else {

                state.inspectedPoint = {
                    lat:
                        lat,
                    lon:
                        lon
                };


                selectObject(
                    null
                );


                updateInspection();

                render();
            }


            return;
        }


        if (
            PLAN.isTimeLocked(
                state.currentTime
            )
        ) {

            statusMessage(
                "You cannot create weather inside a locked period.",
                "Locked:"
            );

            return;
        }


        const object =
            PLAN.createObject(
                state.tool,
                lat,
                lon,
                new Date(
                    state.currentTime
                ).toISOString()
            );


        /*
            Prevent default object ending beyond planning block only if the
            block itself ends earlier than the default 24-hour duration.
        */
        const blockEnd =
            Date.parse(
                PLAN.planningBlock.end
            );


        if (
            Date.parse(
                object.endTime
            ) >
            blockEnd
        ) {

            object.endTime =
                new Date(
                    blockEnd
                ).toISOString();
        }


        /*
            Useful defaults by object type.
        */
        if (
            object.type ===
            "airmass"
        ) {

            object.temperatureAnomaly =
                Number(
                    object.strength ||
                    0
                );
        }


        PLAN.objects.push(
            object
        );


        markDirty();


        setTool(
            "inspect"
        );


        selectObject(
            object.id
        );


        statusMessage(
            "Created " +
            object.name +
            "."
        );
    }


    function handleMapPointerMove(
        event
    ) {

        const p =
            canvasPointFromEvent(
                event
            );


        const lon =
            clamp(
                xToLon(
                    p.x
                ),
                PLAN.bounds.west,
                PLAN.bounds.east
            );


        const lat =
            clamp(
                yToLat(
                    p.y
                ),
                PLAN.bounds.south,
                PLAN.bounds.north
            );


        el.mapCoordinates.textContent =
            lat.toFixed(2) +
            "°N, " +
            (
                lon >= 0
                    ? lon.toFixed(2) +
                    "°E"
                    : Math.abs(
                        lon
                    ).toFixed(2) +
                    "°W"
            ) +
            " · " +
            (
                isLand(
                    lat,
                    lon
                )
                    ? "LAND"
                    : "SEA"
            );
    }


    /* =====================================================================
       TOOLBAR
       ===================================================================== */

    function setTool(tool) {

        state.tool =
            tool;


        document
            .querySelectorAll(
                "[data-tool]"
            )
            .forEach(
                button => {

                    button.classList.toggle(
                        "active",
                        button.dataset.tool ===
                        tool
                    );
                }
            );


        switch (tool) {

            case "inspect":

                el.mapHelp.textContent =
                    "Inspect mode: click the map to inspect weather. " +
                    "Click near an active weather object to select it.";

                break;


            case "high":

                el.mapHelp.textContent =
                    "Click the map to place a high-pressure system.";

                break;


            case "low":

                el.mapHelp.textContent =
                    "Click the map to place a low-pressure system.";

                break;


            case "airmass":

                el.mapHelp.textContent =
                    "Click the map to place an air mass. Configure its " +
                    "temperature anomaly, type, radius and movement.";

                break;


            case "coldfront":

                el.mapHelp.textContent =
                    "Click the map to place a cold front.";

                break;


            case "warmfront":

                el.mapHelp.textContent =
                    "Click the map to place a warm front.";

                break;


            case "precip":

                el.mapHelp.textContent =
                    "Click the map to place a precipitation area.";

                break;
        }
    }


    /* =====================================================================
       SELECTION / OBJECT EDITOR
       ===================================================================== */

    function selectedObject() {

        if (
            !state.selectedObjectId
        ) {
            return null;
        }


        return (
            PLAN.objects.find(
                object =>
                    object.id ===
                    state.selectedObjectId
            ) ||
            null
        );
    }


    function selectObject(id) {

        state.selectedObjectId =
            id;


        updateObjectEditor();

        updateObjectList();

        render();
    }


    function updateObjectEditor() {

        const object =
            selectedObject();


        if (!object) {

            el.selectedEmpty
                .classList
                .remove(
                    "hidden"
                );


            el.selectedEditor
                .classList
                .add(
                    "hidden"
                );


            el.deleteSelected.disabled =
                true;


            el.duplicateSelected.disabled =
                true;


            return;
        }


        el.selectedEmpty
            .classList
            .add(
                "hidden"
            );


        el.selectedEditor
            .classList
            .remove(
                "hidden"
            );


        const locked =
            PLAN.objectTouchesLockedTime(
                object
            );


        el.lockedObjectNote
            .classList
            .toggle(
                "hidden",
                !locked
            );


        el.deleteSelected.disabled =
            locked;


        el.duplicateSelected.disabled =
            false;


        el.objName.value =
            object.name ||
            "";


        el.objType.value =
            object.type ||
            "";


        el.objStartTime.value =
            toDateTimeLocalValue(
                Date.parse(
                    object.startTime
                )
            );


        el.objEndTime.value =
            toDateTimeLocalValue(
                Date.parse(
                    object.endTime
                )
            );


        el.objStartLat.value =
            Number(
                object.start.lat
            ).toFixed(2);


        el.objStartLon.value =
            Number(
                object.start.lon
            ).toFixed(2);


        el.objEndLat.value =
            Number(
                object.end.lat
            ).toFixed(2);


        el.objEndLon.value =
            Number(
                object.end.lon
            ).toFixed(2);


        el.objStrength.value =
            Number(
                object.type ===
                "airmass"
                    ? (
                        object.temperatureAnomaly ??
                        object.strength ??
                        0
                    )
                    : (
                        object.strength ??
                        0
                    )
            );


        el.objRadius.value =
            Number(
                object.radiusKm ||
                400
            );


        el.objAirmass.value =
            object.airmass ||
            "atlantic";


        el.objAngle.value =
            Number(
                object.angle ||
                0
            );


        el.objLength.value =
            Number(
                object.lengthKm ||
                700
            );


        el.objPrecipMode.value =
            object.precipitationPhase ||
            "auto";


        el.objPrecipRate.value =
            Number(
                object.precipitationRate ||
                0
            );


        el.objCloud.value =
            Number(
                object.cloudCover ??
                100
            );


        el.objNotes.value =
            object.notes ||
            "";


        const isAirmass =
            object.type ===
            "airmass";


        const isFront =
            object.type ===
            "coldfront" ||
            object.type ===
            "warmfront";


        const isPrecip =
            object.type ===
            "precip";


        el.fieldAirmass
            .classList
            .toggle(
                "hidden",
                !isAirmass
            );


        el.fieldFront
            .classList
            .toggle(
                "hidden",
                !isFront
            );


        el.fieldPrecip
            .classList
            .toggle(
                "hidden",
                !(
                    isFront ||
                    isPrecip
                )
            );


        /*
            Disable all editor controls when locked.
        */
        el.selectedEditor
            .querySelectorAll(
                "input, select, textarea"
            )
            .forEach(
                control => {

                    /*
                        Object type is always read-only anyway.
                    */
                    if (
                        control ===
                        el.objType
                    ) {
                        control.disabled =
                            false;

                        control.readOnly =
                            true;

                        return;
                    }


                    control.disabled =
                        locked;
                }
            );
    }


    function updateSelectedObjectFromEditor() {

        const object =
            selectedObject();


        if (!object) {
            return;
        }


        if (
            PLAN.objectTouchesLockedTime(
                object
            )
        ) {

            updateObjectEditor();

            statusMessage(
                "Locked weather cannot be edited.",
                "Locked:"
            );

            return;
        }


        const proposedStart =
            parseDateTimeLocalAsUTC(
                el.objStartTime.value
            );


        const proposedEnd =
            parseDateTimeLocalAsUTC(
                el.objEndTime.value
            );


        if (
            !Number.isFinite(
                proposedStart
            ) ||
            !Number.isFinite(
                proposedEnd
            ) ||
            proposedEnd <=
            proposedStart
        ) {

            statusMessage(
                "Object start/end times are invalid."
            );

            updateObjectEditor();

            return;
        }


        const lockedThrough =
            PLAN.completion
                .lockedThrough
                ? Date.parse(
                    PLAN.completion
                        .lockedThrough
                )
                : null;


        if (
            Number.isFinite(
                lockedThrough
            ) &&
            proposedStart <=
            lockedThrough
        ) {

            statusMessage(
                "An editable weather object cannot be moved into locked time.",
                "Locked:"
            );

            updateObjectEditor();

            return;
        }


        object.name =
            (
                el.objName.value.trim() ||
                object.type
            );


        object.startTime =
            new Date(
                proposedStart
            ).toISOString();


        object.endTime =
            new Date(
                proposedEnd
            ).toISOString();


        object.start.lat =
            clamp(
                el.objStartLat.value,
                PLAN.bounds.south,
                PLAN.bounds.north
            );


        object.start.lon =
            clamp(
                el.objStartLon.value,
                PLAN.bounds.west,
                PLAN.bounds.east
            );


        object.end.lat =
            clamp(
                el.objEndLat.value,
                PLAN.bounds.south,
                PLAN.bounds.north
            );


        object.end.lon =
            clamp(
                el.objEndLon.value,
                PLAN.bounds.west,
                PLAN.bounds.east
            );


        object.radiusKm =
            clamp(
                el.objRadius.value,
                20,
                3000
            );


        object.notes =
            el.objNotes.value;


        if (
            object.type ===
            "airmass"
        ) {

            object.airmass =
                el.objAirmass.value;


            object.temperatureAnomaly =
                clamp(
                    el.objStrength.value,
                    -30,
                    30
                );


            object.strength =
                object.temperatureAnomaly;


            object.moisture =
                defaultAirmassMoisture(
                    object.airmass
                );
        }
        else {

            object.strength =
                clamp(
                    el.objStrength.value,
                    -60,
                    60
                );
        }


        if (
            object.type ===
            "coldfront" ||
            object.type ===
            "warmfront"
        ) {

            object.angle =
                normalizeDegrees(
                    Number(
                        el.objAngle.value ||
                        0
                    )
                );


            object.lengthKm =
                clamp(
                    el.objLength.value,
                    50,
                    3000
                );


            object.temperatureContrast =
                Math.abs(
                    Number(
                        object.strength ||
                        4
                    )
                );


            object.precipitationRate =
                clamp(
                    el.objPrecipRate.value,
                    0,
                    100
                );


            object.cloudCover =
                clamp(
                    el.objCloud.value,
                    0,
                    100
                );


            object.precipitationPhase =
                el.objPrecipMode.value;
        }


        if (
            object.type ===
            "precip"
        ) {

            object.angle =
                normalizeDegrees(
                    Number(
                        el.objAngle.value ||
                        0
                    )
                );


            object.precipitationRate =
                clamp(
                    el.objPrecipRate.value,
                    0,
                    100
                );


            object.cloudCover =
                clamp(
                    el.objCloud.value,
                    0,
                    100
                );


            object.precipitationPhase =
                el.objPrecipMode.value;
        }


        /*
            Keep central-pressure metadata coherent for exported data.
        */
        if (
            object.type ===
            "high" ||
            object.type ===
            "low"
        ) {

            object.centralPressure =
                1012 +
                Number(
                    object.strength ||
                    0
                );
        }


        PLAN.metadata.lastModified =
            new Date().toISOString();


        markDirty();

        updateObjectList();

        updateInspection();

        render();
    }


    function deleteSelectedObject() {

        const object =
            selectedObject();


        if (!object) {
            return;
        }


        if (
            PLAN.objectTouchesLockedTime(
                object
            )
        ) {

            statusMessage(
                "Locked weather cannot be deleted.",
                "Locked:"
            );

            return;
        }


        const index =
            PLAN.objects.findIndex(
                item =>
                    item.id ===
                    object.id
            );


        if (
            index >= 0
        ) {

            PLAN.objects.splice(
                index,
                1
            );
        }


        state.selectedObjectId =
            null;


        markDirty();

        updateObjectEditor();

        updateObjectList();

        updateInspection();

        render();


        statusMessage(
            "Weather object deleted."
        );
    }


    function duplicateSelectedObject() {

        const object =
            selectedObject();


        if (!object) {
            return;
        }


        const clone =
            PLAN.cloneObject(
                object
            );


        /*
            Never duplicate a new editable object into locked time.

            If original is locked, move copy to current time.
        */
        if (
            PLAN.objectTouchesLockedTime(
                object
            )
        ) {

            const duration =
                Math.max(
                    MS_HOUR,
                    Date.parse(
                        object.endTime
                    ) -
                    Date.parse(
                        object.startTime
                    )
                );


            let start =
                state.currentTime;


            const lock =
                PLAN.completion
                    .lockedThrough
                    ? Date.parse(
                        PLAN.completion
                            .lockedThrough
                    )
                    : null;


            if (
                Number.isFinite(lock) &&
                start <= lock
            ) {

                start =
                    lock +
                    MS_MINUTE;
            }


            clone.startTime =
                new Date(
                    start
                ).toISOString();


            clone.endTime =
                new Date(
                    start +
                    duration
                ).toISOString();
        }


        PLAN.objects.push(
            clone
        );


        markDirty();

        selectObject(
            clone.id
        );


        statusMessage(
            "Weather object duplicated."
        );
    }


    /* =====================================================================
       ACTIVE OBJECT LIST
       ===================================================================== */

    function updateObjectList() {

        const active =
            PLAN.objects
                .filter(
                    object =>
                        objectActiveAt(
                            object,
                            state.currentTime
                        )
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        String(
                            a.type
                        )
                        .localeCompare(
                            String(
                                b.type
                            )
                        )
                );


        el.objectList.innerHTML =
            "";


        if (
            active.length === 0
        ) {

            const empty =
                document.createElement(
                    "div"
                );


            empty.className =
                "selected-empty";


            empty.textContent =
                "No weather objects active at this time.";


            el.objectList.appendChild(
                empty
            );

            return;
        }


        for (
            const object of
            active
        ) {

            const button =
                document.createElement(
                    "button"
                );


            button.type =
                "button";


            button.className =
                "object-item";


            if (
                state.selectedObjectId ===
                object.id
            ) {

                button.classList.add(
                    "selected"
                );
            }


            const name =
                document.createElement(
                    "span"
                );


            name.className =
                "object-name";


            name.textContent =
                object.name;


            const type =
                document.createElement(
                    "span"
                );


            type.className =
                "object-type";


            type.textContent =
                object.type;


            button.appendChild(
                name
            );


            button.appendChild(
                type
            );


            button.addEventListener(
                "click",
                () => {

                    selectObject(
                        object.id
                    );
                }
            );


            el.objectList.appendChild(
                button
            );
        }
    }


    /* =====================================================================
       INSPECTION
       ===================================================================== */

    function updateInspection() {

        if (
            !state.inspectedPoint
        ) {
            return;
        }


        const lat =
            state.inspectedPoint.lat;


        const lon =
            state.inspectedPoint.lon;


        const wx =
            calculateWeather(
                lat,
                lon,
                state.currentTime,
                true
            );


        el.inspectedLocation.textContent =
            lat.toFixed(2) +
            "°N, " +
            (
                lon >= 0
                    ? lon.toFixed(2) +
                    "°E"
                    : Math.abs(
                        lon
                    ).toFixed(2) +
                    "°W"
            ) +
            " · " +
            formatDateTimeUTC(
                state.currentTime
            );


        el.wxTemp.textContent =
            wx.temperatureC
                .toFixed(1) +
            " °C";


        el.wxPressure.textContent =
            Math.round(
                wx.pressureHpa
            ) +
            " hPa";


        el.wxWind.textContent =
            windDirectionName(
                wx.windDirectionDeg
            ) +
            " " +
            wx.windSpeedMs
                .toFixed(1) +
            " m/s";


        el.wxCloud.textContent =
            Math.round(
                wx.cloudCoverPercent
            ) +
            "%";


        if (
            wx.precipitationRateMmH <
            0.05
        ) {

            el.wxPrecip.textContent =
                "Dry";
        }
        else {

            el.wxPrecip.textContent =
                phaseLabel(
                    wx.precipitationPhase
                ) +
                " · " +
                wx.precipitationRateMmH
                    .toFixed(1) +
                " mm/h";
        }


        el.wxSnow.textContent =
            wx.snowDepthCm <
            0.1
                ? "0 cm"
                : wx.snowDepthCm
                    .toFixed(1) +
                    " cm";


        el.wxSurface.textContent =
            (
                wx.land
                    ? "Land"
                    : "Sea"
            ) +
            " · " +
            wx.biomeState
                .replaceAll(
                    "_",
                    " "
                );
    }


    function phaseLabel(phase) {

        switch (phase) {

            case "rain":
                return "Rain";

            case "sleet":
                return "Sleet";

            case "wet_snow":
                return "Wet snow";

            case "snow":
                return "Snow";

            default:
                return "None";
        }
    }


    function windDirectionName(degrees) {

        const dirs = [
            "N",
            "NE",
            "E",
            "SE",
            "S",
            "SW",
            "W",
            "NW"
        ];


        return dirs[
            Math.round(
                normalizeDegrees(
                    degrees
                ) /
                45
            ) %
            8
        ];
    }


    /* =====================================================================
       TIMELINE
       ===================================================================== */

    function rebuildTimelineBounds() {

        const blockStart =
            Date.parse(
                PLAN.planningBlock.start
            );


        const blockEnd =
            Date.parse(
                PLAN.planningBlock.end
            );


        let start =
            blockStart;


        /*
            If there is locked weather immediately before the block, expose
            the requested final 12 hours.
        */
        if (
            PLAN.completion
                .lockedThrough
        ) {

            const locked =
                Date.parse(
                    PLAN.completion
                        .lockedThrough
                );


            if (
                Number.isFinite(
                    locked
                ) &&
                locked <
                blockStart
            ) {

                start =
                    Math.max(
                        locked -
                        Number(
                            PLAN.lockedHistoryHours ||
                            12
                        ) *
                        MS_HOUR,
                        locked -
                        48 *
                        MS_HOUR
                    );
            }
        }


        state.displayStart =
            start;


        state.displayEnd =
            blockEnd;


        el.timelineStart.textContent =
            formatShortUTC(
                state.displayStart
            );


        el.timelineEnd.textContent =
            formatShortUTC(
                state.displayEnd
            );


        state.currentTime =
            clamp(
                state.currentTime,
                state.displayStart,
                state.displayEnd
            );


        syncTimelineControls();
    }


    function sliderToTime(value) {

        const t =
            clamp(
                Number(value) /
                1000,
                0,
                1
            );


        return (
            state.displayStart +
            t *
            (
                state.displayEnd -
                state.displayStart
            )
        );
    }


    function timeToSlider(ms) {

        if (
            state.displayEnd <=
            state.displayStart
        ) {
            return 0;
        }


        return (
            (
                ms -
                state.displayStart
            ) /
            (
                state.displayEnd -
                state.displayStart
            ) *
            1000
        );
    }


    function setCurrentTime(ms) {

        state.currentTime =
            clamp(
                ms,
                state.displayStart,
                state.displayEnd
            );


        syncTimelineControls();

        updateTopStatus();

        updateObjectList();

        updateObjectEditor();

        updateInspection();

        render();
    }


    function syncTimelineControls() {

        el.timeSlider.value =
            String(
                clamp(
                    timeToSlider(
                        state.currentTime
                    ),
                    0,
                    1000
                )
            );


        el.timeInput.value =
            toDateTimeLocalValue(
                state.currentTime
            );
    }


    function moveCurrentTime(
        hours
    ) {

        setCurrentTime(
            state.currentTime +
            hours *
            MS_HOUR
        );
    }


    /* =====================================================================
       DONE / LOCKED
       ===================================================================== */

    function markDoneThroughCurrent() {

        const lock =
            PLAN.completion
                .lockedThrough
                ? Date.parse(
                    PLAN.completion
                        .lockedThrough
                )
                : null;


        if (
            Number.isFinite(lock) &&
            state.currentTime <
            lock
        ) {

            statusMessage(
                "Done state cannot be moved behind the locked boundary.",
                "Locked:"
            );

            return;
        }


        PLAN.completion.doneThrough =
            new Date(
                state.currentTime
            ).toISOString();


        PLAN.metadata.lastModified =
            new Date().toISOString();


        markDirty();

        updateTopStatus();


        statusMessage(
            "Weather marked Done through " +
            formatDateTimeUTC(
                state.currentTime
            ) +
            "."
        );
    }


    function lockThroughCurrent() {

        const done =
            PLAN.completion
                .doneThrough
                ? Date.parse(
                    PLAN.completion
                        .doneThrough
                )
                : null;


        if (
            !Number.isFinite(done) ||
            done <
            state.currentTime
        ) {

            statusMessage(
                "Mark this period Done before locking it.",
                "Not locked:"
            );

            return;
        }


        const previousLock =
            PLAN.completion
                .lockedThrough
                ? Date.parse(
                    PLAN.completion
                        .lockedThrough
                )
                : null;


        if (
            Number.isFinite(
                previousLock
            ) &&
            state.currentTime <=
            previousLock
        ) {

            statusMessage(
                "This time is already locked.",
                "Locked:"
            );

            return;
        }


        PLAN.completion.lockedThrough =
            new Date(
                state.currentTime
            ).toISOString();


        PLAN.lockSnapshots.push({

            lockedAt:
                new Date().toISOString(),

            through:
                PLAN.completion
                    .lockedThrough,

            /*
                Metadata snapshot.

                Actual immutability is guaranteed because:
                - objects touching locked time cannot be edited
                - new objects cannot be created inside locked time
                - editable objects cannot be moved into locked time
            */
            objectIds:
                PLAN.objects
                    .filter(
                        object =>
                            Date.parse(
                                object.startTime
                            ) <=
                            state.currentTime
                    )
                    .map(
                        object =>
                            object.id
                    )
        });


        PLAN.metadata.lastModified =
            new Date().toISOString();


        markDirty();

        updateTopStatus();

        updateObjectEditor();


        statusMessage(
            "Weather permanently locked through " +
            formatDateTimeUTC(
                state.currentTime
            ) +
            ".",
            "Locked:"
        );
    }


    function currentPlanningState() {

        const t =
            state.currentTime;


        const locked =
            PLAN.completion
                .lockedThrough
                ? Date.parse(
                    PLAN.completion
                        .lockedThrough
                )
                : null;


        const done =
            PLAN.completion
                .doneThrough
                ? Date.parse(
                    PLAN.completion
                        .doneThrough
                )
                : null;


        if (
            Number.isFinite(
                locked
            ) &&
            t <= locked
        ) {

            return "LOCKED";
        }


        if (
            Number.isFinite(
                done
            ) &&
            t <= done
        ) {

            return "DONE";
        }


        return "NOT DONE";
    }


    /* =====================================================================
       TOP STATUS
       ===================================================================== */

    function updateTopStatus() {

        el.currentTime.textContent =
            formatDateTimeUTC(
                state.currentTime
            );


        const start =
            Date.parse(
                PLAN.planningBlock.start
            );


        const end =
            Date.parse(
                PLAN.planningBlock.end
            );


        el.planRange.textContent =
            formatShortUTC(
                start
            ) +
            " → " +
            formatShortUTC(
                end
            );


        const status =
            currentPlanningState();


        el.lockState.textContent =
            status;


        el.lockState.classList.toggle(
            "locked",
            status === "LOCKED"
        );


        el.lockState.classList.toggle(
            "good",
            status === "DONE"
        );


        if (
            status === "LOCKED"
        ) {

            el.timelineMiddle.textContent =
                "LOCKED · view only";
        }
        else if (
            status === "DONE"
        ) {

            el.timelineMiddle.textContent =
                "DONE · reviewed but editable";
        }
        else {

            el.timelineMiddle.textContent =
                "NOT DONE · editable";
        }
    }


    /* =====================================================================
       SAVE / LOAD
       ===================================================================== */

    function markDirty() {

        state.dirty =
            true;


        PLAN.metadata.lastModified =
            new Date().toISOString();
    }


    function saveLocal() {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(
                    PLAN.toSerializable()
                )
            );


            state.dirty =
                false;


            statusMessage(
                "Working weather plan saved in this browser."
            );
        }
        catch (error) {

            console.error(error);


            statusMessage(
                "Could not save the working plan locally."
            );
        }
    }


    function loadLocalIfPresent() {

        try {

            const raw =
                localStorage.getItem(
                    STORAGE_KEY
                );


            if (!raw) {
                return false;
            }


            const data =
                JSON.parse(
                    raw
                );


            PLAN.loadSerializable(
                data
            );


            statusMessage(
                "Loaded locally saved EuropaCraft weather plan."
            );


            return true;
        }
        catch (error) {

            console.error(
                "Could not load local EuropaCraft weather plan.",
                error
            );


            return false;
        }
    }


    function resetLocalWorkingCopy() {

        const confirmed =
            window.confirm(
                "Reset the local working copy and return to the " +
                "weather plan contained in europacraft-weather-plan.js?\n\n" +
                "Locked data in the local working copy will also be removed."
            );


        if (!confirmed) {
            return;
        }


        try {

            localStorage.removeItem(
                STORAGE_KEY
            );


            PLAN.loadSerializable(
                deepCopy(
                    ORIGINAL_FILE_PLAN
                )
            );


            state.selectedObjectId =
                null;


            state.currentTime =
                Date.parse(
                    PLAN.planningBlock.start
                );


            state.inspectedPoint = {
                lat: 53.5,
                lon: 15.0
            };


            state.dirty =
                false;


            rebuildTimelineBounds();

            refreshEverything();


            statusMessage(
                "Local working copy reset to the file-defined plan."
            );
        }
        catch (error) {

            console.error(error);


            statusMessage(
                "Could not reset the local working copy."
            );
        }
    }


    /* =====================================================================
       EXPORTS
       ===================================================================== */

    function downloadJSON(
        filename,
        data
    ) {

        const json =
            JSON.stringify(
                data,
                null,
                2
            );


        const blob =
            new Blob(
                [json],
                {
                    type:
                        "application/json;charset=utf-8"
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        link.download =
            filename;


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


        window.setTimeout(
            () => {

                URL.revokeObjectURL(
                    url
                );
            },
            1000
        );
    }


    function exportPlannerJSON() {

        const payload =
            PLAN.toSerializable();


        payload.exportedAt =
            new Date().toISOString();


        downloadJSON(
            "europacraft-weather-plan.json",
            payload
        );


        statusMessage(
            "Planner JSON exported."
        );
    }


    function exportServerWeather() {

        const payload = {

            format:
                "EuropaCraftServerWeather",

            formatVersion:
                1,

            engineVersion:
                ENGINE_VERSION,

            exportedAt:
                new Date().toISOString(),

            deterministic:
                true,

            randomWeather:
                false,

            externalApiRequired:
                false,

            bounds:
                deepCopy(
                    PLAN.bounds
                ),

            planningBlock:
                deepCopy(
                    PLAN.planningBlock
                ),

            completion:
                deepCopy(
                    PLAN.completion
                ),

            authoritativeThrough:
                PLAN.completion
                    .lockedThrough,

            climatologyModel: {

                id:
                    "EC_EUROPE_SIMPLE_V1",

                description:
                    "EuropaCraft deterministic European baseline " +
                    "climatology with manually authored synoptic modifiers.",

                landSeaMask:
                    "EC_SIMPLIFIED_EUROPE_MASK_V1"
            },

            serverRules: {

                useUTCForWeather:
                    true,

                precipitationPhases: [
                    "none",
                    "rain",
                    "sleet",
                    "wet_snow",
                    "snow"
                ],

                biomeStates: [
                    "sea",
                    "cold_sea",
                    "normal",
                    "wet",
                    "hot",
                    "frozen_ground",
                    "snow_covered"
                ],

                snowAccumulation:
                    Boolean(
                        PLAN.settings
                            .snowAccumulationEnabled
                    )
            },

            objects:
                deepCopy(
                    PLAN.objects
                ),

            overrides:
                deepCopy(
                    PLAN.overrides
                ),

            lockSnapshots:
                deepCopy(
                    PLAN.lockSnapshots
                )
        };


        downloadJSON(
            "europacraft-server-weather.json",
            payload
        );


        if (
            !payload.authoritativeThrough
        ) {

            statusMessage(
                "Server weather exported, but no dates are locked yet. " +
                "The export therefore has no authoritative final-through date."
            );
        }
        else {

            statusMessage(
                "Server weather exported through locked date " +
                formatDateTimeUTC(
                    Date.parse(
                        payload.authoritativeThrough
                    )
                ) +
                "."
            );
        }
    }


    /* =====================================================================
       EVENT LISTENERS
       ===================================================================== */

    function installEventListeners() {

        document
            .querySelectorAll(
                "[data-tool]"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        () => {

                            setTool(
                                button.dataset.tool
                            );
                        }
                    );
                }
            );


        canvas.addEventListener(
            "click",
            handleMapClick
        );


        canvas.addEventListener(
            "pointermove",
            handleMapPointerMove
        );


        canvas.addEventListener(
            "pointerleave",
            () => {

                el.mapCoordinates.textContent =
                    "—";
            }
        );


        el.timeSlider.addEventListener(
            "input",
            () => {

                setCurrentTime(
                    sliderToTime(
                        el.timeSlider.value
                    )
                );
            }
        );


        el.timeInput.addEventListener(
            "change",
            () => {

                const value =
                    parseDateTimeLocalAsUTC(
                        el.timeInput.value
                    );


                if (
                    !Number.isFinite(
                        value
                    )
                ) {

                    syncTimelineControls();

                    return;
                }


                setCurrentTime(
                    value
                );
            }
        );


        el.minus6h.addEventListener(
            "click",
            () =>
                moveCurrentTime(
                    -6
                )
        );


        el.minus1h.addEventListener(
            "click",
            () =>
                moveCurrentTime(
                    -1
                )
        );


        el.plus1h.addEventListener(
            "click",
            () =>
                moveCurrentTime(
                    1
                )
        );


        el.plus6h.addEventListener(
            "click",
            () =>
                moveCurrentTime(
                    6
                )
        );


        el.deleteSelected.addEventListener(
            "click",
            deleteSelectedObject
        );


        el.duplicateSelected.addEventListener(
            "click",
            duplicateSelectedObject
        );


        const editorControls = [
            el.objName,
            el.objStartTime,
            el.objEndTime,
            el.objStartLat,
            el.objStartLon,
            el.objEndLat,
            el.objEndLon,
            el.objStrength,
            el.objRadius,
            el.objAirmass,
            el.objAngle,
            el.objLength,
            el.objPrecipMode,
            el.objPrecipRate,
            el.objCloud,
            el.objNotes
        ];


        for (
            const control of
            editorControls
        ) {

            control.addEventListener(
                "change",
                updateSelectedObjectFromEditor
            );


            if (
                control.type ===
                "text" ||
                control.tagName ===
                "TEXTAREA"
            ) {

                control.addEventListener(
                    "blur",
                    updateSelectedObjectFromEditor
                );
            }
        }


        el.markDone.addEventListener(
            "click",
            markDoneThroughCurrent
        );


        el.lockThrough.addEventListener(
            "click",
            lockThroughCurrent
        );


        el.saveLocal.addEventListener(
            "click",
            saveLocal
        );


        el.exportPlan.addEventListener(
            "click",
            exportPlannerJSON
        );


        el.exportServer.addEventListener(
            "click",
            exportServerWeather
        );


        el.resetPlan.addEventListener(
            "click",
            resetLocalWorkingCopy
        );


        window.addEventListener(
            "resize",
            resizeCanvas
        );


        window.addEventListener(
            "beforeunload",
            event => {

                if (!state.dirty) {
                    return;
                }


                event.preventDefault();

                event.returnValue =
                    "";
            }
        );
    }


    /* =====================================================================
       FULL UI REFRESH
       ===================================================================== */

    function refreshEverything() {

        updateTopStatus();

        syncTimelineControls();

        updateObjectList();

        updateObjectEditor();

        updateInspection();

        render();
    }


    /* =====================================================================
       PUBLIC ENGINE API
       =====================================================================

       This gives you a clean interface if the website grows later.

       Example:

           EuropaWeather.getWeather(
               53.4,
               14.6,
               "2026-11-12T18:00:00Z"
           )

       ===================================================================== */

    window.EuropaWeather = {

        version:
            ENGINE_VERSION,


        isLand:
            function (
                lat,
                lon
            ) {

                return isLand(
                    Number(lat),
                    Number(lon)
                );
            },


        getBaselineTemperature:
            function (
                lat,
                lon,
                time
            ) {

                const ms =
                    typeof time ===
                    "number"
                        ? time
                        : Date.parse(time);


                return baselineTemperature(
                    Number(lat),
                    Number(lon),
                    ms
                );
            },


        getWeather:
            function (
                lat,
                lon,
                time
            ) {

                const ms =
                    typeof time ===
                    "number"
                        ? time
                        : Date.parse(time);


                if (
                    !Number.isFinite(ms)
                ) {

                    throw new Error(
                        "Invalid EuropaCraft weather time."
                    );
                }


                return calculateWeather(
                    Number(lat),
                    Number(lon),
                    ms,
                    true
                );
            },


        getWeatherFast:
            function (
                lat,
                lon,
                time
            ) {

                const ms =
                    typeof time ===
                    "number"
                        ? time
                        : Date.parse(time);


                if (
                    !Number.isFinite(ms)
                ) {

                    throw new Error(
                        "Invalid EuropaCraft weather time."
                    );
                }


                return calculateWeatherCore(
                    Number(lat),
                    Number(lon),
                    ms
                );
            },


        setTime:
            function (time) {

                const ms =
                    typeof time ===
                    "number"
                        ? time
                        : Date.parse(time);


                if (
                    !Number.isFinite(ms)
                ) {

                    throw new Error(
                        "Invalid EuropaCraft planner time."
                    );
                }


                setCurrentTime(
                    ms
                );
            },


        render:
            render,


        exportServerWeather:
            exportServerWeather
    };


    /* =====================================================================
       INITIALISE
       ===================================================================== */

    function initialise() {

        const validation =
            PLAN.validate();


        if (
            !validation.valid
        ) {

            console.error(
                validation.errors
            );


            statusMessage(
                validation.errors.join(
                    " | "
                ),
                "Plan error:"
            );


            return;
        }


        loadLocalIfPresent();


        /*
            Revalidate after loading local data.
        */
        const afterLoad =
            PLAN.validate();


        if (
            !afterLoad.valid
        ) {

            console.error(
                afterLoad.errors
            );


            PLAN.loadSerializable(
                deepCopy(
                    ORIGINAL_FILE_PLAN
                )
            );


            statusMessage(
                "Saved local data was invalid. Loaded the file-defined plan instead."
            );
        }


        state.currentTime =
            Date.parse(
                PLAN.planningBlock.start
            );


        installEventListeners();

        rebuildTimelineBounds();

        resizeCanvas();

        refreshEverything();


        console.info(
            "EuropaCraft Weather Planner ready.",
            {
                engineVersion:
                    ENGINE_VERSION,

                objects:
                    PLAN.objects.length,

                planningBlock:
                    PLAN.planningBlock
            }
        );


        statusMessage(
            "EuropaCraft Weather Planner ready. " +
            "Place a High, Low, Air Mass, Front or Precipitation Area to begin."
        );
    }


    initialise();

})();
