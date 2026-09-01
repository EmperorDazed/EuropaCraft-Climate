"use strict";

/*
    ========================================================================
    EuropaCraft Weather Planner — deterministic authoring engine
    File 3 of 3 code files: europacraft-weather.js

    Required data file beside it:
        europacraft-elevation.png

    IMPORTANT DATASET RULES
    -----------------------
    The PNG must cover exactly:
        74°N to 30°N
        26°W to 52°E

    Projection:
        equirectangular / Plate Carrée
        north at top, west at left

    Encoding:
        SEA  = RGB 0,0,0
        LAND = grayscale 1..255

    Recommended planner copy size:
        1560 × 880 pixels

    The planner deliberately uses the raster itself as the land/sea mask.
    There are NO hand-drawn Europe polygons and NO random coastlines.

    Weather is deterministic. Nothing meteorological uses Math.random().
    ========================================================================
*/

(function () {
    "use strict";

    if (!window.EuropaWeatherPlan) {
        throw new Error(
            "europacraft-weather-plan.js must load before europacraft-weather.js"
        );
    }

    const PLAN = window.EuropaWeatherPlan;

    const ENGINE_VERSION = "2.0-authored-raster-paths";
    const STORAGE_KEY = "europacraft-weather-planner-v2";

    const MS_MINUTE = 60 * 1000;
    const MS_HOUR = 60 * MS_MINUTE;
    const MS_DAY = 24 * MS_HOUR;

    const KM_PER_DEG = 111.32;

    /*
        Adjust only if your grayscale DEM uses a different vertical scale.
    */
    const DEM_MAX_METRES = 4500;

    /*
        Pure black is sea.

        IMPORTANT:
        Real low-lying land must therefore be at least grayscale value 1.
    */
    const SEA_PIXEL_MAX = 0;

    /*
        Environmental lapse rate used by the simple climate baseline.
    */
    const LAPSE_RATE_C_PER_KM = 6.2;

    const ORIGINAL_FILE_PLAN =
        deepCopy(
            PLAN.toSerializable()
        );


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
        tool:
            "inspect",

        layer:
            "synoptic",

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

        displayStart:
            0,

        displayEnd:
            0,

        dirty:
            false,

        drawingWidth:
            0,

        drawingHeight:
            0,

        dpr:
            1,

        rasterReady:
            false,

        rasterError:
            false,

        drawPath:
            [],

        drawPathActive:
            false
    };


    /* =====================================================================
       ELEVATION RASTER
       ===================================================================== */

    const dem = {
        canvas:
            document.createElement("canvas"),

        ctx:
            null,

        width:
            0,

        height:
            0,

        pixels:
            null,

        baseMapCanvas:
            document.createElement("canvas")
    };


    dem.ctx =
        dem.canvas.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );


    function loadElevationDataset() {

        const image =
            new Image();


        image.onload =
            function () {

                /*
                    Downsample once to a manageable planning raster.

                    This means even if you accidentally provide a much larger
                    source PNG, the weather planner does not perform every
                    calculation against a 30,000-pixel-wide image.
                */
                const targetW =
                    Math.min(
                        1800,
                        image.naturalWidth ||
                        1560
                    );


                const targetH =
                    Math.max(
                        1,
                        Math.round(
                            targetW *
                            44 /
                            78
                        )
                    );


                dem.width =
                    targetW;

                dem.height =
                    targetH;


                dem.canvas.width =
                    targetW;

                dem.canvas.height =
                    targetH;


                dem.ctx.imageSmoothingEnabled =
                    true;


                dem.ctx.drawImage(
                    image,
                    0,
                    0,
                    targetW,
                    targetH
                );


                try {

                    dem.pixels =
                        dem.ctx.getImageData(
                            0,
                            0,
                            targetW,
                            targetH
                        ).data;
                }
                catch (error) {

                    console.error(
                        error
                    );


                    state.rasterError =
                        true;


                    statusMessage(
                        "Elevation PNG loaded but its pixels could not be read. " +
                        "Keep the file on the same GitHub Pages origin.",
                        "Dataset error:"
                    );


                    render();

                    return;
                }


                state.rasterReady =
                    true;

                state.rasterError =
                    false;


                buildBaseMapRaster();


                statusMessage(
                    "EuropaCraft elevation dataset loaded. " +
                    "Land, sea and elevation now come from the raster."
                );


                refreshEverything();
            };


        image.onerror =
            function () {

                state.rasterReady =
                    false;

                state.rasterError =
                    true;


                statusMessage(
                    "Add europacraft-elevation.png beside the three code files. " +
                    "Europe will not be approximated with fake polygons.",
                    "Elevation dataset missing:"
                );


                render();
            };


        image.src =
            "europacraft-elevation.png?v=2";
    }


    function rasterPixel(
        lat,
        lon
    ) {

        if (
            !state.rasterReady ||
            !dem.pixels
        ) {

            return {
                land: false,
                value: 0,
                elevationM: 0
            };
        }


        const b =
            PLAN.bounds;


        const fx =
            clamp(
                (
                    lon -
                    b.west
                ) /
                (
                    b.east -
                    b.west
                ),
                0,
                0.999999
            );


        const fy =
            clamp(
                (
                    b.north -
                    lat
                ) /
                (
                    b.north -
                    b.south
                ),
                0,
                0.999999
            );


        const x =
            Math.floor(
                fx *
                dem.width
            );


        const y =
            Math.floor(
                fy *
                dem.height
            );


        const idx =
            (
                y *
                dem.width +
                x
            ) *
            4;


        const r =
            dem.pixels[idx];

        const g =
            dem.pixels[idx + 1];

        const bl =
            dem.pixels[idx + 2];


        const value =
            Math.round(
                (
                    r +
                    g +
                    bl
                ) /
                3
            );


        const land =
            Math.max(
                r,
                g,
                bl
            ) >
            SEA_PIXEL_MAX;


        return {
            land:
                land,

            value:
                value,

            elevationM:
                land
                    ? (
                        value /
                        255
                    ) *
                    DEM_MAX_METRES
                    : 0
        };
    }


    function isLand(
        lat,
        lon
    ) {

        return rasterPixel(
            lat,
            lon
        ).land;
    }


    function elevationM(
        lat,
        lon
    ) {

        return rasterPixel(
            lat,
            lon
        ).elevationM;
    }


    function buildBaseMapRaster() {

        const w =
            dem.width;

        const h =
            dem.height;


        const base =
            dem.baseMapCanvas;


        base.width =
            w;

        base.height =
            h;


        const bctx =
            base.getContext("2d");


        const image =
            bctx.createImageData(
                w,
                h
            );


        for (
            let y = 0;
            y < h;
            y++
        ) {

            for (
                let x = 0;
                x < w;
                x++
            ) {

                const src =
                    (
                        y *
                        w +
                        x
                    ) *
                    4;


                const r =
                    dem.pixels[src];

                const g =
                    dem.pixels[src + 1];

                const bl =
                    dem.pixels[src + 2];


                const value =
                    (
                        r +
                        g +
                        bl
                    ) /
                    3;


                const land =
                    Math.max(
                        r,
                        g,
                        bl
                    ) >
                    SEA_PIXEL_MAX;


                const dst =
                    src;


                if (!land) {

                    image.data[dst] =
                        20;

                    image.data[dst + 1] =
                        51;

                    image.data[dst + 2] =
                        70;

                    image.data[dst + 3] =
                        255;

                    continue;
                }


                const n =
                    value /
                    255;


                let rr;
                let gg;
                let bb;


                if (
                    n <
                    0.16
                ) {

                    rr =
                        lerp(
                            62,
                            90,
                            n /
                            0.16
                        );

                    gg =
                        lerp(
                            92,
                            110,
                            n /
                            0.16
                        );

                    bb =
                        lerp(
                            59,
                            63,
                            n /
                            0.16
                        );
                }
                else if (
                    n <
                    0.42
                ) {

                    const t =
                        (
                            n -
                            0.16
                        ) /
                        0.26;


                    rr =
                        lerp(
                            90,
                            117,
                            t
                        );

                    gg =
                        lerp(
                            110,
                            106,
                            t
                        );

                    bb =
                        lerp(
                            63,
                            77,
                            t
                        );
                }
                else if (
                    n <
                    0.72
                ) {

                    const t =
                        (
                            n -
                            0.42
                        ) /
                        0.30;


                    rr =
                        lerp(
                            117,
                            148,
                            t
                        );

                    gg =
                        lerp(
                            106,
                            130,
                            t
                        );

                    bb =
                        lerp(
                            77,
                            105,
                            t
                        );
                }
                else {

                    const t =
                        (
                            n -
                            0.72
                        ) /
                        0.28;


                    rr =
                        lerp(
                            148,
                            222,
                            t
                        );

                    gg =
                        lerp(
                            130,
                            218,
                            t
                        );

                    bb =
                        lerp(
                            105,
                            210,
                            t
                        );
                }


                image.data[dst] =
                    Math.round(rr);

                image.data[dst + 1] =
                    Math.round(gg);

                image.data[dst + 2] =
                    Math.round(bb);

                image.data[dst + 3] =
                    255;
            }
        }


        bctx.putImageData(
            image,
            0,
            0
        );
    }


    /* =====================================================================
       GENERIC HELPERS
       ===================================================================== */

    function clamp(
        value,
        min,
        max
    ) {

        value =
            Number(value);


        if (
            !Number.isFinite(
                value
            )
        ) {

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


    function lerp(
        a,
        b,
        t
    ) {

        return (
            a +
            (
                b -
                a
            ) *
            t
        );
    }


    function smoothstep(t) {

        t =
            clamp(
                t,
                0,
                1
            );


        return (
            t *
            t *
            (
                3 -
                2 *
                t
            )
        );
    }


    function deepCopy(value) {

        return JSON.parse(
            JSON.stringify(value)
        );
    }


    function degToRad(deg) {

        return (
            deg *
            Math.PI /
            180
        );
    }


    function radToDeg(rad) {

        return (
            rad *
            180 /
            Math.PI
        );
    }


    function normalizeDegrees(value) {

        value %=
            360;


        if (
            value <
            0
        ) {

            value +=
                360;
        }


        return value;
    }


    function pad2(value) {

        return String(
            value
        )
        .padStart(
            2,
            "0"
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


    function formatDateTimeUTC(ms) {

        const d =
            new Date(ms);


        return (
            d.getUTCFullYear() +
            "-" +
            pad2(
                d.getUTCMonth() +
                1
            ) +
            "-" +
            pad2(
                d.getUTCDate()
            ) +
            " " +
            pad2(
                d.getUTCHours()
            ) +
            ":" +
            pad2(
                d.getUTCMinutes()
            ) +
            " UTC"
        );
    }


    function formatShortUTC(ms) {

        const d =
            new Date(ms);


        return (
            pad2(
                d.getUTCDate()
            ) +
            " " +
            monthShort(
                d.getUTCMonth()
            ) +
            " " +
            pad2(
                d.getUTCHours()
            ) +
            ":" +
            pad2(
                d.getUTCMinutes()
            )
        );
    }


    function toDateTimeLocalValue(ms) {

        const d =
            new Date(ms);


        return (
            d.getUTCFullYear() +
            "-" +
            pad2(
                d.getUTCMonth() +
                1
            ) +
            "-" +
            pad2(
                d.getUTCDate()
            ) +
            "T" +
            pad2(
                d.getUTCHours()
            ) +
            ":" +
            pad2(
                d.getUTCMinutes()
            )
        );
    }


    function parseDateTimeLocalAsUTC(value) {

        const match =
            /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
            .exec(
                value ||
                ""
            );


        if (!match) {
            return NaN;
        }


        return Date.UTC(
            Number(
                match[1]
            ),
            Number(
                match[2]
            ) -
            1,
            Number(
                match[3]
            ),
            Number(
                match[4]
            ),
            Number(
                match[5]
            )
        );
    }


    function dayOfYearUTC(ms) {

        const d =
            new Date(ms);


        return (
            Math.floor(
                (
                    ms -
                    Date.UTC(
                        d.getUTCFullYear(),
                        0,
                        1
                    )
                ) /
                MS_DAY
            ) +
            1
        );
    }


    function statusMessage(
        text,
        strong
    ) {

        if (strong) {

            el.status.innerHTML =
                "<strong>" +
                escapeHTML(
                    strong
                ) +
                "</strong> " +
                escapeHTML(
                    text
                );
        }
        else {

            el.status.textContent =
                text;
        }
    }


    function escapeHTML(text) {

        return String(text)
            .replaceAll(
                "&",
                "&amp;"
            )
            .replaceAll(
                "<",
                "&lt;"
            )
            .replaceAll(
                ">",
                "&gt;"
            )
            .replaceAll(
                '"',
                "&quot;"
            )
            .replaceAll(
                "'",
                "&#039;"
            );
    }


    function kmPerLonDegree(lat) {

        return (
            KM_PER_DEG *
            Math.max(
                0.12,
                Math.cos(
                    degToRad(lat)
                )
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
            (
                lat1 +
                lat2
            ) /
            2;


        const dx =
            (
                lon2 -
                lon1
            ) *
            kmPerLonDegree(
                meanLat
            );


        const dy =
            (
                lat2 -
                lat1
            ) *
            KM_PER_DEG;


        return Math.hypot(
            dx,
            dy
        );
    }


    function localVectorKm(
        fromLat,
        fromLon,
        toLat,
        toLon
    ) {

        const meanLat =
            (
                fromLat +
                toLat
            ) /
            2;


        return {
            x:
                (
                    toLon -
                    fromLon
                ) *
                kmPerLonDegree(
                    meanLat
                ),

            y:
                (
                    toLat -
                    fromLat
                ) *
                KM_PER_DEG
        };
    }


    /* =====================================================================
       PROJECTION
       ===================================================================== */

    function lonToX(lon) {

        const b =
            PLAN.bounds;


        return (
            (
                lon -
                b.west
            ) /
            (
                b.east -
                b.west
            ) *
            state.drawingWidth
        );
    }


    function latToY(lat) {

        const b =
            PLAN.bounds;


        return (
            (
                b.north -
                lat
            ) /
            (
                b.north -
                b.south
            ) *
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
            (
                b.east -
                b.west
            )
        );
    }


    function yToLat(y) {

        const b =
            PLAN.bounds;


        return (
            b.north -
            y /
            state.drawingHeight *
            (
                b.north -
                b.south
            )
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
       COMPACT CLIMATOLOGY
       ===================================================================== */

    function continentality(
        lat,
        lon,
        land
    ) {

        if (!land) {
            return 0.05;
        }


        let c =
            clamp(
                (
                    lon +
                    5
                ) /
                38,
                0.08,
                0.95
            );


        if (
            lon <
            3 &&
            lat >
            48
        ) {

            c *=
                0.48;
        }


        if (
            lat <
            45 &&
            lon <
            15
        ) {

            c *=
                0.72;
        }


        return c;
    }


    function baselineAnnualTemperature(
        lat,
        lon,
        land
    ) {

        let annual =
            17.7 -
            0.47 *
            (
                lat -
                35
            );


        if (!land) {

            annual +=
                0.7;
        }


        if (
            land &&
            lon <
            2 &&
            lat >
            48
        ) {

            annual +=
                1.1;
        }


        if (
            land &&
            lat <
            45
        ) {

            annual +=
                1.2;
        }


        if (
            land &&
            lon >
            22
        ) {

            annual -=
                0.3;
        }


        return annual;
    }


    function baselineTemperatureNoElevation(
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
            dayOfYearUTC(
                ms
            );


        const c =
            continentality(
                lat,
                lon,
                land
            );


        const annual =
            baselineAnnualTemperature(
                lat,
                lon,
                land
            );


        const amplitude =
            land
                ? (
                    6.2 +
                    c *
                    8.0 +
                    Math.max(
                        0,
                        lat -
                        48
                    ) *
                    0.06
                )
                : 5.2;


        const seasonal =
            amplitude *
            Math.cos(
                2 *
                Math.PI *
                (
                    doy -
                    200
                ) /
                365.2422
            );


        const date =
            new Date(ms);


        let solarHour =
            date.getUTCHours() +
            date.getUTCMinutes() /
            60 +
            lon /
            15;


        solarHour =
            (
                (
                    solarHour %
                    24
                ) +
                24
            ) %
            24;


        const diurnalAmplitude =
            land
                ? (
                    1.8 +
                    c *
                    2.7
                )
                : 0.65;


        const diurnal =
            diurnalAmplitude *
            Math.cos(
                2 *
                Math.PI *
                (
                    solarHour -
                    15
                ) /
                24
            );


        return (
            annual +
            seasonal +
            diurnal
        );
    }


    function baselineTemperature(
        lat,
        lon,
        ms
    ) {

        const base =
            baselineTemperatureNoElevation(
                lat,
                lon,
                ms
            );


        const elevation =
            elevationM(
                lat,
                lon
            );


        return (
            base -
            LAPSE_RATE_C_PER_KM *
            elevation /
            1000
        );
    }


    function baselinePressure(
        lat,
        lon,
        ms
    ) {

        const doy =
            dayOfYearUTC(
                ms
            );


        const winterFactor =
            (
                1 +
                Math.cos(
                    2 *
                    Math.PI *
                    (
                        doy -
                        15
                    ) /
                    365.2422
                )
            ) /
            2;


        return (
            1015.5 -
            clamp(
                (
                    lat -
                    45
                ) /
                25,
                0,
                1
            ) *
            winterFactor *
            3
        );
    }


    function baselineCloud(
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
            dayOfYearUTC(
                ms
            );


        const winterFactor =
            (
                1 +
                Math.cos(
                    2 *
                    Math.PI *
                    (
                        doy -
                        15
                    ) /
                    365.2422
                )
            ) /
            2;


        let cloud =
            42 +
            winterFactor *
            18;


        if (!land) {

            cloud +=
                10;
        }


        if (
            lon <
            2 &&
            lat >
            48
        ) {

            cloud +=
                8;
        }


        if (
            lat <
            45 &&
            lon >
            -8
        ) {

            cloud -=
                14;
        }


        if (
            lon >
            18
        ) {

            cloud -=
                3;
        }


        return clamp(
            cloud,
            12,
            88
        );
    }


    /* =====================================================================
       CURVED / ZIG-ZAG TRACKS
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

        const t =
            objectTimes(
                object
            );


        return (
            Number.isFinite(
                t.start
            ) &&
            Number.isFinite(
                t.end
            ) &&
            ms >=
            t.start &&
            ms <=
            t.end
        );
    }


    function objectProgress(
        object,
        ms
    ) {

        const t =
            objectTimes(
                object
            );


        if (
            !Number.isFinite(
                t.start
            ) ||
            !Number.isFinite(
                t.end
            ) ||
            t.end <=
            t.start
        ) {

            return 0;
        }


        const progress =
            clamp(
                (
                    ms -
                    t.start
                ) /
                (
                    t.end -
                    t.start
                ),
                0,
                1
            );


        if (
            PLAN.settings
                .movementInterpolation ===
            "linear"
        ) {

            return progress;
        }


        return smoothstep(
            progress
        );
    }


    function trackPoints(object) {

        if (
            Array.isArray(
                object.path
            ) &&
            object.path.length >=
            2
        ) {

            return object.path.map(
                (
                    point,
                    index,
                    array
                ) => {

                    return {
                        lat:
                            Number(
                                point.lat
                            ),

                        lon:
                            Number(
                                point.lon
                            ),

                        u:
                            Number.isFinite(
                                Number(
                                    point.u
                                )
                            )
                                ? clamp(
                                    Number(
                                        point.u
                                    ),
                                    0,
                                    1
                                )
                                : (
                                    index /
                                    (
                                        array.length -
                                        1
                                    )
                                )
                    };
                }
            );
        }


        return [
            {
                lat:
                    Number(
                        object.start.lat
                    ),

                lon:
                    Number(
                        object.start.lon
                    ),

                u:
                    0
            },

            {
                lat:
                    Number(
                        object.end.lat
                    ),

                lon:
                    Number(
                        object.end.lon
                    ),

                u:
                    1
            }
        ];
    }


    function catmullRom(
        a,
        b,
        c,
        d,
        t
    ) {

        const t2 =
            t *
            t;


        const t3 =
            t2 *
            t;


        return (
            0.5 *
            (
                2 *
                b +

                (
                    -a +
                    c
                ) *
                t +

                (
                    2 *
                    a -
                    5 *
                    b +
                    4 *
                    c -
                    d
                ) *
                t2 +

                (
                    -a +
                    3 *
                    b -
                    3 *
                    c +
                    d
                ) *
                t3
            )
        );
    }


    function positionOnTrack(
        object,
        progress
    ) {

        const points =
            trackPoints(
                object
            );


        progress =
            clamp(
                progress,
                0,
                1
            );


        let segment =
            0;


        while (
            segment <
            points.length -
            2 &&
            progress >
            points[
                segment +
                1
            ].u
        ) {

            segment++;
        }


        const p1 =
            points[
                segment
            ];


        const p2 =
            points[
                Math.min(
                    segment +
                    1,
                    points.length -
                    1
                )
            ];


        const span =
            Math.max(
                0.000001,
                p2.u -
                p1.u
            );


        const localT =
            clamp(
                (
                    progress -
                    p1.u
                ) /
                span,
                0,
                1
            );


        if (
            points.length ===
            2 ||
            object.pathStyle ===
            "linear"
        ) {

            return {
                lat:
                    lerp(
                        p1.lat,
                        p2.lat,
                        localT
                    ),

                lon:
                    lerp(
                        p1.lon,
                        p2.lon,
                        localT
                    )
            };
        }


        const p0 =
            points[
                Math.max(
                    0,
                    segment -
                    1
                )
            ];


        const p3 =
            points[
                Math.min(
                    points.length -
                    1,
                    segment +
                    2
                )
            ];


        return {
            lat:
                catmullRom(
                    p0.lat,
                    p1.lat,
                    p2.lat,
                    p3.lat,
                    localT
                ),

            lon:
                catmullRom(
                    p0.lon,
                    p1.lon,
                    p2.lon,
                    p3.lon,
                    localT
                )
        };
    }


    function objectPosition(
        object,
        ms
    ) {

        return positionOnTrack(
            object,
            objectProgress(
                object,
                ms
            )
        );
    }


    function radialWeight(
        distance,
        radius
    ) {

        const x =
            distance /
            Math.max(
                1,
                radius
            );


        if (
            x >=
            1
        ) {

            return 0;
        }


        const t =
            1 -
            x;


        return (
            t *
            t *
            (
                3 -
                2 *
                t
            )
        );
    }


    /* =====================================================================
       AIR-MASS MOISTURE PICKUP
       ===================================================================== */

    function defaultAirmassMoisture(type) {

        switch (type) {

            case "arctic":
                return 0.22;

            case "polar_maritime":
                return 0.72;

            case "atlantic":
                return 0.78;

            case "continental":
                return 0.26;

            case "mediterranean":
                return 0.62;

            case "tropical":
                return 0.28;

            default:
                return 0.48;
        }
    }


    function moistureAlongTrack(
        object,
        progress
    ) {

        let moisture =
            defaultAirmassMoisture(
                object.airmass
            );


        const samples =
            36;


        const steps =
            Math.max(
                1,
                Math.ceil(
                    samples *
                    clamp(
                        progress,
                        0,
                        1
                    )
                )
            );


        let previous =
            positionOnTrack(
                object,
                0
            );


        for (
            let i = 1;
            i <= steps;
            i++
        ) {

            const u =
                clamp(
                    progress *
                    i /
                    steps,
                    0,
                    1
                );


            const point =
                positionOnTrack(
                    object,
                    u
                );


            const distance =
                distanceKm(
                    previous.lat,
                    previous.lon,
                    point.lat,
                    point.lon
                );


            const overSea =
                !isLand(
                    point.lat,
                    point.lon
                );


            if (overSea) {

                /*
                    Long sea tracks progressively load the air mass with
                    moisture.

                    Arctic air dragged over Norwegian Sea -> North Sea ->
                    Baltic can therefore become extremely moisture-rich.
                */
                const pickup =
                    1 -
                    Math.exp(
                        -distance /
                        260
                    );


                moisture =
                    lerp(
                        moisture,
                        0.94,
                        pickup
                    );
            }
            else {

                /*
                    Moisture slowly decays over long continental journeys.
                */
                const decay =
                    1 -
                    Math.exp(
                        -distance /
                        700
                    );


                moisture =
                    lerp(
                        moisture,
                        0.34,
                        decay *
                        0.45
                    );
            }


            previous =
                point;
        }


        return clamp(
            moisture,
            0.05,
            0.98
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
            Math.sin(
                angle
            );


        const uy =
            Math.cos(
                angle
            );


        const point =
            localVectorKm(
                centre.lat,
                centre.lon,
                lat,
                lon
            );


        const projection =
            clamp(
                point.x *
                ux +
                point.y *
                uy,
                -halfLength,
                halfLength
            );


        return Math.hypot(
            point.x -
            ux *
            projection,

            point.y -
            uy *
            projection
        );
    }


    /* =====================================================================
       NATURAL PRECIPITATION HELPERS
       ===================================================================== */

    function sampleUpwindElevation(
        lat,
        lon,
        windFromDeg,
        distanceKmValue
    ) {

        const direction =
            degToRad(
                windFromDeg
            );


        const dx =
            Math.sin(
                direction
            ) *
            distanceKmValue;


        const dy =
            Math.cos(
                direction
            ) *
            distanceKmValue;


        const upLat =
            lat +
            dy /
            KM_PER_DEG;


        const upLon =
            lon +
            dx /
            kmPerLonDegree(
                lat
            );


        return elevationM(
            upLat,
            upLon
        );
    }


    function automaticPrecipitationPhase(
        temperature
    ) {

        if (
            temperature <=
            -0.5
        ) {

            return "snow";
        }


        if (
            temperature <=
            0.7
        ) {

            return "wet_snow";
        }


        if (
            temperature <=
            2.0
        ) {

            return "sleet";
        }


        return "rain";
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


        const baselineTemp =
            baselineTemperature(
                lat,
                lon,
                ms
            );


        let temperature =
            baselineTemp;


        let pressure =
            baselinePressure(
                lat,
                lon,
                ms
            );


        let cloud =
            baselineCloud(
                lat,
                lon,
                ms
            );


        let moisture =
            land
                ? 0.46
                : 0.72;


        let precipRate =
            0;


        let forcedPhase =
            null;


        let synopticLift =
            0;


        let frontalLift =
            0;


        /*
            Modest climatological westerly background.
        */
        let windX =
            4.5;


        let windY =
            0;


        const contributions =
            [];


        for (
            const object of
            PLAN.objects
        ) {

            if (
                !objectActiveAt(
                    object,
                    ms
                )
            ) {

                continue;
            }


            const position =
                objectPosition(
                    object,
                    ms
                );


            const distance =
                distanceKm(
                    lat,
                    lon,
                    position.lat,
                    position.lon
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
                    distance,
                    radius
                );


            /* -------------------------------------------------------------
               HIGH / LOW
               ------------------------------------------------------------- */

            if (
                object.type ===
                "high" ||
                object.type ===
                "low"
            ) {

                if (
                    weight <=
                    0
                ) {

                    continue;
                }


                const strength =
                    Number(
                        object.strength ||
                        0
                    );


                pressure +=
                    strength *
                    weight;


                if (
                    object.type ===
                    "high"
                ) {

                    cloud -=
                        25 *
                        weight;


                    synopticLift -=
                        0.45 *
                        weight;
                }
                else {

                    cloud +=
                        26 *
                        weight;


                    synopticLift +=
                        clamp(
                            (
                                -strength -
                                5
                            ) /
                            25,
                            0,
                            1.5
                        ) *
                        weight;
                }


                /*
                    Northern Hemisphere circulation.

                    Low:
                        counter-clockwise

                    High:
                        clockwise
                */
                const vector =
                    localVectorKm(
                        position.lat,
                        position.lon,
                        lat,
                        lon
                    );


                const length =
                    Math.hypot(
                        vector.x,
                        vector.y
                    ) ||
                    1;


                const nx =
                    vector.x /
                    length;


                const ny =
                    vector.y /
                    length;


                const tangentX =
                    object.type ===
                    "low"
                        ? -ny
                        : ny;


                const tangentY =
                    object.type ===
                    "low"
                        ? nx
                        : -nx;


                const speed =
                    Math.abs(
                        strength
                    ) *
                    0.35 *
                    weight;


                windX +=
                    tangentX *
                    speed;


                windY +=
                    tangentY *
                    speed;


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


            /* -------------------------------------------------------------
               AIR MASS
               ------------------------------------------------------------- */

            if (
                object.type ===
                "airmass"
            ) {

                if (
                    weight <=
                    0
                ) {

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
                            object.strength ||
                            0
                        );


                const pathMoisture =
                    moistureAlongTrack(
                        object,
                        objectProgress(
                            object,
                            ms
                        )
                    );


                temperature +=
                    anomaly *
                    weight;


                moisture =
                    lerp(
                        moisture,
                        pathMoisture,
                        weight *
                        0.9
                    );


                cloud +=
                    Math.max(
                        0,
                        pathMoisture -
                        0.52
                    ) *
                    58 *
                    weight;


                /*
                    Moist air that has crossed sea and then reaches land
                    acquires a weak precipitation tendency even before any
                    explicit front is added.
                */
                if (
                    land &&
                    pathMoisture >
                    0.72
                ) {

                    synopticLift +=
                        (
                            pathMoisture -
                            0.72
                        ) *
                        1.2 *
                        weight;
                }


                contributions.push({
                    id:
                        object.id,

                    type:
                        object.type,

                    weight:
                        weight,

                    moisture:
                        pathMoisture
                });


                continue;
            }


            /* -------------------------------------------------------------
               FRONTS
               ------------------------------------------------------------- */

            if (
                object.type ===
                "coldfront" ||
                object.type ===
                "warmfront"
            ) {

                const frontDistance =
                    pointToFrontDistanceKm(
                        lat,
                        lon,
                        object,
                        ms
                    );


                const frontWeight =
                    radialWeight(
                        frontDistance,
                        Math.max(
                            20,
                            Number(
                                object.widthKm ||
                                120
                            )
                        )
                    );


                if (
                    frontWeight <=
                    0
                ) {

                    continue;
                }


                const contrast =
                    Math.abs(
                        Number(
                            object.temperatureContrast ??
                            object.strength ??
                            4
                        )
                    );


                temperature +=
                    (
                        object.type ===
                        "warmfront"
                            ? 0.18
                            : -0.22
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


                frontalLift +=
                    1.25 *
                    frontWeight;


                const explicitPrecip =
                    Math.max(
                        0,
                        Number(
                            object.precipitationRate ||
                            0
                        )
                    );


                /*
                    You can still explicitly strengthen a front's rain,
                    but precipitation no longer requires this value.
                */
                if (
                    explicitPrecip >
                    0
                ) {

                    precipRate +=
                        explicitPrecip *
                        frontWeight;
                }


                if (
                    object.precipitationPhase &&
                    object.precipitationPhase !==
                    "auto" &&
                    frontWeight >
                    0.45
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
                        frontWeight
                });


                continue;
            }


            /* -------------------------------------------------------------
               EXPLICIT PRECIP AREA
               ------------------------------------------------------------- */

            if (
                object.type ===
                "precip"
            ) {

                if (
                    weight <=
                    0
                ) {

                    continue;
                }


                precipRate +=
                    Math.max(
                        0,
                        Number(
                            object.precipitationRate ||
                            object.strength ||
                            0
                        )
                    ) *
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
                    weight >
                    0.35
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


        /* -------------------------------------------------------------
           WIND
           ------------------------------------------------------------- */

        const windSpeed =
            Math.hypot(
                windX,
                windY
            );


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


        /* -------------------------------------------------------------
           REAL DEM OROGRAPHIC LIFT
           ------------------------------------------------------------- */

        let orographicLift =
            0;


        if (
            land &&
            windSpeed >
            1.5
        ) {

            const currentElevation =
                elevationM(
                    lat,
                    lon
                );


            const upwind80 =
                sampleUpwindElevation(
                    lat,
                    lon,
                    windFrom,
                    80
                );


            const upwind160 =
                sampleUpwindElevation(
                    lat,
                    lon,
                    windFrom,
                    160
                );


            const rise =
                Math.max(
                    0,
                    currentElevation -
                    Math.min(
                        upwind80,
                        upwind160
                    )
                );


            orographicLift =
                clamp(
                    rise /
                    700,
                    0,
                    1.8
                ) *
                clamp(
                    windSpeed /
                    8,
                    0.3,
                    1.8
                );
        }


        /* -------------------------------------------------------------
           NATURAL CLOUD BUILDUP
           ------------------------------------------------------------- */

        cloud =
            clamp(
                cloud +

                15 *
                orographicLift +

                16 *
                frontalLift +

                10 *
                Math.max(
                    0,
                    synopticLift
                ),

                0,
                100
            );


        /* -------------------------------------------------------------
           NATURAL PRECIPITATION
           ------------------------------------------------------------- */

        const saturation =
            clamp(
                (
                    moisture -
                    0.50
                ) /
                0.40,
                0,
                1
            );


        const lift =
            Math.max(
                0,
                synopticLift +
                frontalLift +
                orographicLift
            );


        const cloudSupport =
            clamp(
                (
                    cloud -
                    68
                ) /
                32,
                0,
                1
            );


        if (
            saturation >
            0 &&
            cloudSupport >
            0
        ) {

            const naturalRate =
                saturation *
                cloudSupport *
                (
                    0.20 +
                    1.65 *
                    lift
                );


            precipRate +=
                naturalRate;
        }


        /*
            Thick, moisture-saturated maritime cloud may produce drizzle
            even with weak dynamical lift.
        */
        if (
            precipRate <
            0.08 &&
            moisture >
            0.78 &&
            cloud >
            91
        ) {

            precipRate =
                0.10 +
                (
                    moisture -
                    0.78
                ) *
                1.4;
        }


        precipRate =
            Math.max(
                0,
                precipRate
            );


        const precipPhase =
            precipRate >=
            0.05
                ? (
                    forcedPhase ||
                    automaticPrecipitationPhase(
                        temperature
                    )
                )
                : "none";


        return {
            lat:
                lat,

            lon:
                lon,

            time:
                new Date(
                    ms
                ).toISOString(),

            land:
                land,

            elevationM:
                elevationM(
                    lat,
                    lon
                ),

            baselineTemperatureC:
                baselineTemp,

            temperatureC:
                temperature,

            temperatureAnomalyC:
                temperature -
                baselineTemp,

            pressureHpa:
                pressure,

            humidityIndex:
                clamp(
                    moisture,
                    0,
                    1
                ),

            cloudCoverPercent:
                clamp(
                    cloud,
                    0,
                    100
                ),

            precipitationRateMmH:
                precipRate,

            precipitationPhase:
                precipPhase,

            windSpeedMs:
                windSpeed,

            windDirectionDeg:
                windFrom,

            orographicLift:
                orographicLift,

            synopticLift:
                synopticLift,

            contributions:
                contributions
        };
    }


    /* =====================================================================
       SNOW ACCUMULATION
       ===================================================================== */

    function calculateSnowDepthCm(
        lat,
        lon,
        ms
    ) {

        if (
            !PLAN.settings
                .snowAccumulationEnabled ||
            !isLand(
                lat,
                lon
            )
        ) {

            return 0;
        }


        const step =
            3 *
            MS_HOUR;


        const start =
            ms -
            24 *
            MS_DAY;


        let snow =
            0;


        for (
            let time = start;
            time <= ms;
            time += step
        ) {

            const weather =
                calculateWeatherCore(
                    lat,
                    lon,
                    time
                );


            const hours =
                3;


            const amount =
                weather
                    .precipitationRateMmH *
                hours;


            if (
                weather
                    .precipitationPhase ===
                "snow"
            ) {

                snow +=
                    amount *
                    0.95;
            }
            else if (
                weather
                    .precipitationPhase ===
                "wet_snow"
            ) {

                snow +=
                    amount *
                    0.55;
            }
            else if (
                weather
                    .precipitationPhase ===
                "sleet"
            ) {

                snow +=
                    amount *
                    0.16;
            }
            else if (
                weather
                    .precipitationPhase ===
                "rain" &&
                snow >
                0
            ) {

                snow -=
                    amount *
                    0.20;
            }


            if (
                weather.temperatureC >
                0
            ) {

                const melt =
                    0.035 *
                    weather.temperatureC +

                    0.003 *
                    weather.temperatureC *
                    weather.temperatureC;


                snow -=
                    melt *
                    hours;
            }


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
            500,
            snow
        );
    }


    function calculateWeather(
        lat,
        lon,
        ms,
        includeSnow = true
    ) {

        const weather =
            calculateWeatherCore(
                lat,
                lon,
                ms
            );


        weather.snowDepthCm =
            includeSnow
                ? calculateSnowDepthCm(
                    lat,
                    lon,
                    ms
                )
                : 0;


        weather.biomeState =
            determineBiomeState(
                weather
            );


        return weather;
    }


    function determineBiomeState(
        weather
    ) {

        if (
            !weather.land
        ) {

            if (
                weather.temperatureC <=
                -2 &&
                weather.lat >=
                58
            ) {

                return "cold_sea";
            }


            return "sea";
        }


        if (
            weather.snowDepthCm >=
            2
        ) {

            return "snow_covered";
        }


        if (
            weather.temperatureC <=
            -0.5
        ) {

            return "frozen_ground";
        }


        if (
            weather
                .precipitationRateMmH >=
            0.5
        ) {

            return "wet";
        }


        if (
            weather.temperatureC >=
            25
        ) {

            return "hot";
        }


        return "normal";
    }


    /* =====================================================================
       EXTRA CONTROLS
       ===================================================================== */

    function installExtraToolbar() {

        const toolbar =
            document.querySelector(
                ".toolbar"
            );


        if (
            !toolbar ||
            document.getElementById(
                "ec-layer-select"
            )
        ) {

            return;
        }


        const pathGroup =
            document.createElement(
                "div"
            );


        pathGroup.className =
            "toolbar-group";


        const drawAir =
            document.createElement(
                "button"
            );


        drawAir.type =
            "button";

        drawAir.className =
            "btn";

        drawAir.id =
            "ec-draw-air";

        drawAir.textContent =
            "↝ Draw Air Path";


        const finish =
            document.createElement(
                "button"
            );


        finish.type =
            "button";

        finish.className =
            "btn good hidden";

        finish.id =
            "ec-finish-air";

        finish.textContent =
            "Finish Path";


        const cancel =
            document.createElement(
                "button"
            );


        cancel.type =
            "button";

        cancel.className =
            "btn danger hidden";

        cancel.id =
            "ec-cancel-air";

        cancel.textContent =
            "Cancel Path";


        pathGroup.append(
            drawAir,
            finish,
            cancel
        );


        toolbar.appendChild(
            pathGroup
        );


        const layerGroup =
            document.createElement(
                "div"
            );


        layerGroup.className =
            "toolbar-group";


        const label =
            document.createElement(
                "label"
            );


        label.textContent =
            "Layer ";


        label.style.fontSize =
            "12px";

        label.style.color =
            "#9aa9b6";


        const select =
            document.createElement(
                "select"
            );


        select.id =
            "ec-layer-select";

        select.className =
            "btn";

        select.style.minHeight =
            "34px";


        select.innerHTML = `
            <option value="synoptic">Synoptic</option>
            <option value="temp_anomaly">Temperature anomaly</option>
            <option value="temperature">Temperature</option>
            <option value="precipitation">Precipitation</option>
            <option value="elevation">Elevation</option>
        `;


        label.appendChild(
            select
        );


        layerGroup.appendChild(
            label
        );


        toolbar.appendChild(
            layerGroup
        );


        drawAir.addEventListener(
            "click",
            startAirPathDrawing
        );


        finish.addEventListener(
            "click",
            finishAirPathDrawing
        );


        cancel.addEventListener(
            "click",
            cancelAirPathDrawing
        );


        select.addEventListener(
            "change",
            function () {

                state.layer =
                    select.value;


                render();
            }
        );
    }


    /* =====================================================================
       AIR-PATH DRAWING
       ===================================================================== */

    function startAirPathDrawing() {

        if (
            PLAN.isTimeLocked(
                state.currentTime
            )
        ) {

            statusMessage(
                "You cannot create an air path in locked weather.",
                "Locked:"
            );

            return;
        }


        state.tool =
            "drawair";

        state.drawPath =
            [];

        state.drawPathActive =
            true;


        updateAirPathButtons();


        el.mapHelp.textContent =
            "Draw Air Path: click a start point, then click as many " +
            "curved/zig-zag waypoints as you want. Press Finish Path " +
            "or Enter when done.";


        render();
    }


    function cancelAirPathDrawing() {

        state.drawPath =
            [];

        state.drawPathActive =
            false;

        state.tool =
            "inspect";


        updateAirPathButtons();

        setTool(
            "inspect"
        );

        render();
    }


    function finishAirPathDrawing() {

        if (
            !state.drawPathActive ||
            state.drawPath.length <
            2
        ) {

            statusMessage(
                "Add at least two points before finishing the air path."
            );

            return;
        }


        const first =
            state.drawPath[0];


        const last =
            state.drawPath[
                state.drawPath.length -
                1
            ];


        const object =
            PLAN.createObject(
                "airmass",
                first.lat,
                first.lon,
                new Date(
                    state.currentTime
                ).toISOString()
            );


        /*
            Strong but not ridiculous default for testing.
        */
        object.name =
            "Arctic Air Path";

        object.airmass =
            "arctic";

        object.temperatureAnomaly =
            -8;

        object.strength =
            -8;

        object.radiusKm =
            750;

        object.pathStyle =
            "curved";


        object.start = {
            lat:
                first.lat,

            lon:
                first.lon
        };


        object.end = {
            lat:
                last.lat,

            lon:
                last.lon
        };


        object.endTime =
            new Date(
                Math.min(
                    Date.parse(
                        PLAN.planningBlock.end
                    ),
                    state.currentTime +
                    48 *
                    MS_HOUR
                )
            ).toISOString();


        object.path =
            state.drawPath.map(
                (
                    point,
                    index,
                    array
                ) => {

                    return {
                        lat:
                            point.lat,

                        lon:
                            point.lon,

                        u:
                            array.length ===
                            1
                                ? 0
                                : (
                                    index /
                                    (
                                        array.length -
                                        1
                                    )
                                )
                    };
                }
            );


        PLAN.objects.push(
            object
        );


        markDirty();


        state.drawPath =
            [];

        state.drawPathActive =
            false;

        state.tool =
            "inspect";


        updateAirPathButtons();


        selectObject(
            object.id
        );


        setTool(
            "inspect"
        );


        statusMessage(
            "Curved Arctic air path created. Change its air-mass type, " +
            "anomaly, radius or timing in the editor."
        );
    }


    function updateAirPathButtons() {

        const draw =
            document.getElementById(
                "ec-draw-air"
            );


        const finish =
            document.getElementById(
                "ec-finish-air"
            );


        const cancel =
            document.getElementById(
                "ec-cancel-air"
            );


        if (
            !draw ||
            !finish ||
            !cancel
        ) {

            return;
        }


        draw.classList.toggle(
            "active",
            state.drawPathActive
        );


        finish.classList.toggle(
            "hidden",
            !state.drawPathActive
        );


        cancel.classList.toggle(
            "hidden",
            !state.drawPathActive
        );


        finish.disabled =
            state.drawPath.length <
            2;
    }


    /* =====================================================================
       RENDERING
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


        if (
            state.rasterReady &&
            state.layer !==
            "synoptic" &&
            state.layer !==
            "elevation"
        ) {

            drawWeatherLayer();
        }


        drawGraticule();

        drawWeatherObjects();

        drawDraftAirPath();

        drawInspectionMarker();
    }


    function drawBaseMap() {

        ctx.clearRect(
            0,
            0,
            state.drawingWidth,
            state.drawingHeight
        );


        ctx.fillStyle =
            "#102532";


        ctx.fillRect(
            0,
            0,
            state.drawingWidth,
            state.drawingHeight
        );


        if (
            !state.rasterReady
        ) {

            ctx.fillStyle =
                "#dbe5ec";

            ctx.textAlign =
                "center";

            ctx.font =
                "bold 18px sans-serif";


            ctx.fillText(
                "ELEVATION DATASET REQUIRED",
                state.drawingWidth /
                2,
                state.drawingHeight /
                2 -
                12
            );


            ctx.font =
                "13px sans-serif";

            ctx.fillStyle =
                "#9fb0bd";


            ctx.fillText(
                "Add europacraft-elevation.png — no fake Europe fallback is used.",
                state.drawingWidth /
                2,
                state.drawingHeight /
                2 +
                14
            );


            return;
        }


        ctx.imageSmoothingEnabled =
            true;


        ctx.drawImage(
            dem.baseMapCanvas,
            0,
            0,
            state.drawingWidth,
            state.drawingHeight
        );
    }


    function drawWeatherLayer() {

        const cell =
            Math.max(
                14,
                Math.round(
                    state.drawingWidth /
                    72
                )
            );


        ctx.save();


        for (
            let y = 0;
            y < state.drawingHeight;
            y += cell
        ) {

            for (
                let x = 0;
                x < state.drawingWidth;
                x += cell
            ) {

                const lat =
                    yToLat(
                        y +
                        cell /
                        2
                    );


                const lon =
                    xToLon(
                        x +
                        cell /
                        2
                    );


                const weather =
                    calculateWeatherCore(
                        lat,
                        lon,
                        state.currentTime
                    );


                let color =
                    null;


                if (
                    state.layer ===
                    "temp_anomaly"
                ) {

                    color =
                        anomalyColor(
                            weather
                                .temperatureAnomalyC
                        );
                }
                else if (
                    state.layer ===
                    "temperature"
                ) {

                    color =
                        temperatureColor(
                            weather.temperatureC
                        );
                }
                else if (
                    state.layer ===
                    "precipitation"
                ) {

                    color =
                        precipitationColor(
                            weather
                                .precipitationRateMmH,

                            weather
                                .precipitationPhase
                        );
                }


                if (color) {

                    ctx.fillStyle =
                        color;


                    ctx.fillRect(
                        x,
                        y,
                        cell +
                        1,
                        cell +
                        1
                    );
                }
            }
        }


        ctx.restore();
    }


    function anomalyColor(value) {

        const amount =
            clamp(
                Math.abs(
                    value
                ) /
                14,
                0,
                1
            );


        if (
            value <
            0
        ) {

            return (
                "rgba(" +
                Math.round(
                    60 -
                    15 *
                    amount
                ) +
                "," +
                Math.round(
                    145 +
                    40 *
                    amount
                ) +
                "," +
                Math.round(
                    220 +
                    25 *
                    amount
                ) +
                "," +
                (
                    0.12 +
                    0.52 *
                    amount
                ) +
                ")"
            );
        }


        if (
            value >
            0
        ) {

            return (
                "rgba(" +
                Math.round(
                    225 +
                    25 *
                    amount
                ) +
                "," +
                Math.round(
                    145 -
                    85 *
                    amount
                ) +
                "," +
                Math.round(
                    70 -
                    25 *
                    amount
                ) +
                "," +
                (
                    0.12 +
                    0.52 *
                    amount
                ) +
                ")"
            );
        }


        return (
            "rgba(200,200,200,0.04)"
        );
    }


    function temperatureColor(value) {

        const t =
            clamp(
                (
                    value +
                    20
                ) /
                55,
                0,
                1
            );


        const r =
            Math.round(
                55 +
                200 *
                t
            );


        const g =
            Math.round(
                115 +
                75 *
                (
                    1 -
                    Math.abs(
                        t -
                        0.5
                    ) *
                    2
                )
            );


        const b =
            Math.round(
                230 -
                190 *
                t
            );


        return (
            "rgba(" +
            r +
            "," +
            g +
            "," +
            b +
            ",0.46)"
        );
    }


    function precipitationColor(
        rate,
        phase
    ) {

        if (
            rate <
            0.05
        ) {

            return null;
        }


        const alpha =
            0.18 +
            0.62 *
            clamp(
                Math.log1p(
                    rate
                ) /
                Math.log(
                    11
                ),
                0,
                1
            );


        if (
            phase ===
            "snow" ||
            phase ===
            "wet_snow"
        ) {

            return (
                "rgba(225,240,255," +
                alpha +
                ")"
            );
        }


        if (
            phase ===
            "sleet"
        ) {

            return (
                "rgba(150,210,235," +
                alpha +
                ")"
            );
        }


        return (
            "rgba(45,125,225," +
            alpha +
            ")"
        );
    }


    function drawGraticule() {

        ctx.save();


        ctx.strokeStyle =
            "rgba(220,232,240,0.14)";


        ctx.fillStyle =
            "rgba(230,238,243,0.70)";


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
                lon >=
                0
                    ? lon +
                    "°E"
                    : Math.abs(
                        lon
                    ) +
                    "°W",
                x +
                4,
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
                lat +
                "°N",
                4,
                y -
                4
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


        for (
            const object of
            active
        ) {

            if (
                object.type ===
                "airmass" ||
                object.type ===
                "precip"
            ) {

                drawAreaObject(
                    object
                );
            }
        }


        for (
            const object of
            active
        ) {

            if (
                object.type ===
                "high" ||
                object.type ===
                "low"
            ) {

                drawPressureObject(
                    object
                );
            }
        }


        for (
            const object of
            active
        ) {

            if (
                object.type ===
                "coldfront" ||
                object.type ===
                "warmfront"
            ) {

                drawFrontObject(
                    object
                );
            }
        }
    }


    function drawTrack(object) {

        const points =
            trackPoints(
                object
            );


        if (
            points.length <
            2
        ) {

            return;
        }


        ctx.save();


        ctx.strokeStyle =
            state.selectedObjectId ===
            object.id
                ? "rgba(255,228,130,0.95)"
                : "rgba(235,242,246,0.72)";


        ctx.lineWidth =
            state.selectedObjectId ===
            object.id
                ? 3
                : 1.7;


        ctx.setLineDash(
            [
                7,
                5
            ]
        );


        ctx.beginPath();


        const samples =
            Math.max(
                24,
                points.length *
                14
            );


        for (
            let i = 0;
            i <= samples;
            i++
        ) {

            const point =
                positionOnTrack(
                    object,
                    i /
                    samples
                );


            const x =
                lonToX(
                    point.lon
                );


            const y =
                latToY(
                    point.lat
                );


            if (
                i ===
                0
            ) {

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


        ctx.stroke();

        ctx.setLineDash(
            []
        );


        /*
            Arrowheads along the path.
        */
        for (
            let u = 0.25;
            u < 1;
            u += 0.28
        ) {

            const a =
                positionOnTrack(
                    object,
                    u
                );


            const b =
                positionOnTrack(
                    object,
                    Math.min(
                        1,
                        u +
                        0.015
                    )
                );


            const x1 =
                lonToX(
                    a.lon
                );

            const y1 =
                latToY(
                    a.lat
                );

            const x2 =
                lonToX(
                    b.lon
                );

            const y2 =
                latToY(
                    b.lat
                );


            const dx =
                x2 -
                x1;

            const dy =
                y2 -
                y1;


            const length =
                Math.hypot(
                    dx,
                    dy
                ) ||
                1;


            const ux =
                dx /
                length;

            const uy =
                dy /
                length;


            const px =
                -uy;

            const py =
                ux;


            ctx.fillStyle =
                ctx.strokeStyle;


            ctx.beginPath();


            ctx.moveTo(
                x2,
                y2
            );


            ctx.lineTo(
                x2 -
                ux *
                10 +
                px *
                5,

                y2 -
                uy *
                10 +
                py *
                5
            );


            ctx.lineTo(
                x2 -
                ux *
                10 -
                px *
                5,

                y2 -
                uy *
                10 -
                py *
                5
            );


            ctx.closePath();

            ctx.fill();
        }


        ctx.restore();
    }


    function drawAreaObject(object) {

        drawTrack(
            object
        );


        const position =
            objectPosition(
                object,
                state.currentTime
            );


        const x =
            lonToX(
                position.lon
            );


        const y =
            latToY(
                position.lat
            );


        const radiusLon =
            Number(
                object.radiusKm ||
                400
            ) /
            kmPerLonDegree(
                position.lat
            );


        const radiusLat =
            Number(
                object.radiusKm ||
                400
            ) /
            KM_PER_DEG;


        const rx =
            Math.abs(
                lonToX(
                    position.lon +
                    radiusLon
                ) -
                x
            );


        const ry =
            Math.abs(
                latToY(
                    position.lat +
                    radiusLat
                ) -
                y
            );


        ctx.save();


        if (
            object.type ===
            "precip"
        ) {

            ctx.fillStyle =
                "rgba(55,130,220,0.18)";

            ctx.strokeStyle =
                "rgba(105,180,245,0.92)";
        }
        else {

            const cold =
                Number(
                    object.temperatureAnomaly ??
                    object.strength ??
                    0
                ) <
                0;


            ctx.fillStyle =
                cold
                    ? "rgba(80,165,235,0.16)"
                    : "rgba(235,145,70,0.16)";


            ctx.strokeStyle =
                cold
                    ? "rgba(145,210,250,0.92)"
                    : "rgba(245,185,110,0.92)";
        }


        ctx.lineWidth =
            state.selectedObjectId ===
            object.id
                ? 3
                : 1.5;


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
                ry
            ),
            0,
            0,
            Math.PI *
            2
        );


        ctx.fill();

        ctx.stroke();


        ctx.fillStyle =
            "#f2f6f8";


        ctx.font =
            state.selectedObjectId ===
            object.id
                ? "bold 12px sans-serif"
                : "11px sans-serif";


        ctx.textAlign =
            "center";


        let label =
            object.name ||
            object.type;


        if (
            object.type ===
            "airmass"
        ) {

            const moisture =
                moistureAlongTrack(
                    object,
                    objectProgress(
                        object,
                        state.currentTime
                    )
                );


            const anomaly =
                Number(
                    object.temperatureAnomaly ??
                    object.strength ??
                    0
                );


            label +=
                "  " +
                (
                    anomaly >=
                    0
                        ? "+"
                        : ""
                ) +
                anomaly.toFixed(
                    1
                ) +
                "°C  M" +
                Math.round(
                    moisture *
                    100
                );
        }


        ctx.fillText(
            label,
            x,
            y
        );


        ctx.restore();
    }


    function drawPressureObject(object) {

        drawTrack(
            object
        );


        const position =
            objectPosition(
                object,
                state.currentTime
            );


        const x =
            lonToX(
                position.lon
            );


        const y =
            latToY(
                position.lat
            );


        const high =
            object.type ===
            "high";


        ctx.save();


        ctx.fillStyle =
            "rgba(10,15,20,0.82)";


        ctx.strokeStyle =
            high
                ? "#94d6f4"
                : "#ef9898";


        ctx.lineWidth =
            state.selectedObjectId ===
            object.id
                ? 3
                : 1.7;


        ctx.beginPath();


        ctx.arc(
            x,
            y,
            state.selectedObjectId ===
            object.id
                ? 24
                : 20,
            0,
            Math.PI *
            2
        );


        ctx.fill();

        ctx.stroke();


        ctx.textAlign =
            "center";

        ctx.textBaseline =
            "middle";


        ctx.font =
            "bold 22px sans-serif";


        ctx.fillStyle =
            high
                ? "#b5e5f8"
                : "#ffb3b3";


        ctx.fillText(
            high
                ? "H"
                : "L",
            x,
            y -
            2
        );


        ctx.font =
            "10px sans-serif";


        ctx.fillStyle =
            "#eef3f6";


        ctx.fillText(
            Math.round(
                1012 +
                Number(
                    object.strength ||
                    0
                )
            ) +
            " hPa",
            x,
            y +
            29
        );


        ctx.restore();
    }


    function drawFrontObject(object) {

        drawTrack(
            object
        );


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


        const half =
            Number(
                object.lengthKm ||
                700
            ) /
            2;


        const ux =
            Math.sin(
                angle
            );


        const uy =
            Math.cos(
                angle
            );


        const start = {
            lat:
                centre.lat -
                uy *
                half /
                KM_PER_DEG,

            lon:
                centre.lon -
                ux *
                half /
                kmPerLonDegree(
                    centre.lat
                )
        };


        const end = {
            lat:
                centre.lat +
                uy *
                half /
                KM_PER_DEG,

            lon:
                centre.lon +
                ux *
                half /
                kmPerLonDegree(
                    centre.lat
                )
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
                ? "#6bb5ff"
                : "#ed7f88";


        ctx.lineWidth =
            state.selectedObjectId ===
            object.id
                ? 4
                : 2.2;


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


        ctx.fillStyle =
            "#f4f6f8";


        ctx.font =
            "11px sans-serif";


        ctx.textAlign =
            "center";


        ctx.fillText(
            object.name ||
            object.type,
            lonToX(
                centre.lon
            ),
            latToY(
                centre.lat
            ) -
            12
        );


        ctx.restore();
    }


    function drawDraftAirPath() {

        if (
            !state.drawPathActive ||
            state.drawPath.length ===
            0
        ) {

            return;
        }


        ctx.save();


        ctx.strokeStyle =
            "rgba(255,220,100,0.95)";


        ctx.fillStyle =
            "rgba(255,220,100,0.95)";


        ctx.lineWidth =
            2.5;


        ctx.setLineDash(
            [
                6,
                4
            ]
        );


        ctx.beginPath();


        state.drawPath.forEach(
            (
                point,
                index
            ) => {

                const x =
                    lonToX(
                        point.lon
                    );


                const y =
                    latToY(
                        point.lat
                    );


                if (
                    index ===
                    0
                ) {

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
        );


        ctx.stroke();

        ctx.setLineDash(
            []
        );


        for (
            const point of
            state.drawPath
        ) {

            ctx.beginPath();


            ctx.arc(
                lonToX(
                    point.lon
                ),
                latToY(
                    point.lat
                ),
                4,
                0,
                Math.PI *
                2
            );


            ctx.fill();
        }


        ctx.restore();
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
            "#ffe16e";


        ctx.lineWidth =
            1.5;


        ctx.beginPath();


        ctx.arc(
            x,
            y,
            6,
            0,
            Math.PI *
            2
        );


        ctx.stroke();


        ctx.beginPath();


        ctx.moveTo(
            x -
            10,
            y
        );

        ctx.lineTo(
            x +
            10,
            y
        );


        ctx.moveTo(
            x,
            y -
            10
        );

        ctx.lineTo(
            x,
            y +
            10
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
        maxPixels = 24
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


            const position =
                objectPosition(
                    object,
                    state.currentTime
                );


            const distance =
                Math.hypot(
                    lonToX(
                        position.lon
                    ) -
                    x,

                    latToY(
                        position.lat
                    ) -
                    y
                );


            if (
                distance <
                bestDistance
            ) {

                bestDistance =
                    distance;

                best =
                    object;
            }
        }


        return best;
    }


    function handleMapClick(event) {

        const point =
            canvasPointFromEvent(
                event
            );


        const lon =
            clamp(
                xToLon(
                    point.x
                ),
                PLAN.bounds.west,
                PLAN.bounds.east
            );


        const lat =
            clamp(
                yToLat(
                    point.y
                ),
                PLAN.bounds.south,
                PLAN.bounds.north
            );


        if (
            state.tool ===
            "drawair"
        ) {

            state.drawPath.push({
                lat:
                    lat,

                lon:
                    lon
            });


            updateAirPathButtons();

            render();


            statusMessage(
                state.drawPath.length +
                " air-path point" +
                (
                    state.drawPath.length ===
                    1
                        ? ""
                        : "s"
                ) +
                ". Add more, then Finish Path."
            );


            return;
        }


        if (
            state.tool ===
            "inspect"
        ) {

            const nearby =
                nearestActiveObject(
                    point.x,
                    point.y
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


    function handleMapPointerMove(event) {

        const point =
            canvasPointFromEvent(
                event
            );


        const lon =
            clamp(
                xToLon(
                    point.x
                ),
                PLAN.bounds.west,
                PLAN.bounds.east
            );


        const lat =
            clamp(
                yToLat(
                    point.y
                ),
                PLAN.bounds.south,
                PLAN.bounds.north
            );


        const raster =
            rasterPixel(
                lat,
                lon
            );


        el.mapCoordinates.textContent =
            lat.toFixed(
                2
            ) +
            "°N, " +
            (
                lon >=
                0
                    ? lon.toFixed(
                        2
                    ) +
                    "°E"
                    : Math.abs(
                        lon
                    ).toFixed(
                        2
                    ) +
                    "°W"
            ) +
            " · " +
            (
                raster.land
                    ? Math.round(
                        raster.elevationM
                    ) +
                    " m"
                    : "SEA"
            );
    }


    function setTool(tool) {

        if (
            state.drawPathActive &&
            tool !==
            "drawair"
        ) {

            state.drawPath =
                [];

            state.drawPathActive =
                false;


            updateAirPathButtons();
        }


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


        const help = {
            inspect:
                "Inspect mode: click anywhere to inspect weather. " +
                "Click near an active object to edit it.",

            high:
                "Click to place a high-pressure system.",

            low:
                "Click to place a low-pressure system.",

            airmass:
                "Click to place a simple straight-track air mass. " +
                "Use Draw Air Path for curved/zig-zag movement.",

            coldfront:
                "Click to place a cold front.",

            warmfront:
                "Click to place a warm front.",

            precip:
                "Click to place an explicit precipitation area. " +
                "Natural precipitation can also occur from moist air and lift."
        };


        if (
            help[tool]
        ) {

            el.mapHelp.textContent =
                help[tool];
        }
    }


    /* =====================================================================
       SELECTION / EDITOR
       ===================================================================== */

    function selectedObject() {

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
            ).toFixed(
                2
            );


        el.objStartLon.value =
            Number(
                object.start.lon
            ).toFixed(
                2
            );


        el.objEndLat.value =
            Number(
                object.end.lat
            ).toFixed(
                2
            );


        el.objEndLon.value =
            Number(
                object.end.lon
            ).toFixed(
                2
            );


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


        el.selectedEditor
            .querySelectorAll(
                "input,select,textarea"
            )
            .forEach(
                control => {

                    if (
                        control ===
                        el.objType
                    ) {

                        control.disabled =
                            false;

                        control.readOnly =
                            true;
                    }
                    else {

                        control.disabled =
                            locked;
                    }
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


        const start =
            parseDateTimeLocalAsUTC(
                el.objStartTime.value
            );


        const end =
            parseDateTimeLocalAsUTC(
                el.objEndTime.value
            );


        if (
            !Number.isFinite(
                start
            ) ||
            !Number.isFinite(
                end
            ) ||
            end <=
            start
        ) {

            updateObjectEditor();


            statusMessage(
                "Object start/end times are invalid."
            );


            return;
        }


        const locked =
            PLAN.completion
                .lockedThrough
                ? Date.parse(
                    PLAN.completion
                        .lockedThrough
                )
                : null;


        if (
            Number.isFinite(
                locked
            ) &&
            start <=
            locked
        ) {

            updateObjectEditor();


            statusMessage(
                "An editable object cannot be moved into locked time.",
                "Locked:"
            );


            return;
        }


        object.name =
            el.objName.value.trim() ||
            object.type;


        object.startTime =
            new Date(
                start
            ).toISOString();


        object.endTime =
            new Date(
                end
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


        /*
            If this is a curved path, keep its first/last waypoint tied to
            the editable start/end fields.
        */
        if (
            Array.isArray(
                object.path
            ) &&
            object.path.length >=
            2
        ) {

            object.path[0].lat =
                object.start.lat;

            object.path[0].lon =
                object.start.lon;


            object.path[
                object.path.length -
                1
            ].lat =
                object.end.lat;


            object.path[
                object.path.length -
                1
            ].lon =
                object.end.lon;
        }


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
            index >=
            0
        ) {

            PLAN.objects.splice(
                index,
                1
            );
        }


        state.selectedObjectId =
            null;


        markDirty();

        refreshEverything();


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
                Number.isFinite(
                    lock
                ) &&
                start <=
                lock
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


    function updateObjectList() {

        const active =
            PLAN.objects.filter(
                object =>
                    objectActiveAt(
                        object,
                        state.currentTime
                    )
            );


        el.objectList.innerHTML =
            "";


        if (
            active.length ===
            0
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
                "object-item" +
                (
                    state.selectedObjectId ===
                    object.id
                        ? " selected"
                        : ""
                );


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


            button.append(
                name,
                type
            );


            button.addEventListener(
                "click",
                function () {

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
            !state.inspectedPoint ||
            !state.rasterReady
        ) {

            return;
        }


        const lat =
            state.inspectedPoint.lat;


        const lon =
            state.inspectedPoint.lon;


        const weather =
            calculateWeather(
                lat,
                lon,
                state.currentTime,
                true
            );


        el.inspectedLocation.textContent =
            lat.toFixed(
                2
            ) +
            "°N, " +
            (
                lon >=
                0
                    ? lon.toFixed(
                        2
                    ) +
                    "°E"
                    : Math.abs(
                        lon
                    ).toFixed(
                        2
                    ) +
                    "°W"
            ) +
            " · " +
            formatDateTimeUTC(
                state.currentTime
            ) +
            " · " +
            Math.round(
                weather.elevationM
            ) +
            " m";


        el.wxTemp.textContent =
            weather.temperatureC
                .toFixed(
                    1
                ) +
            " °C (" +
            (
                weather.temperatureAnomalyC >=
                0
                    ? "+"
                    : ""
            ) +
            weather.temperatureAnomalyC
                .toFixed(
                    1
                ) +
            "° anomaly)";


        el.wxPressure.textContent =
            Math.round(
                weather.pressureHpa
            ) +
            " hPa";


        el.wxWind.textContent =
            windDirectionName(
                weather.windDirectionDeg
            ) +
            " " +
            weather.windSpeedMs
                .toFixed(
                    1
                ) +
            " m/s";


        el.wxCloud.textContent =
            Math.round(
                weather.cloudCoverPercent
            ) +
            "%";


        if (
            weather
                .precipitationRateMmH <
            0.05
        ) {

            el.wxPrecip.textContent =
                "Dry";
        }
        else {

            el.wxPrecip.textContent =
                phaseLabel(
                    weather
                        .precipitationPhase
                ) +
                " · " +
                weather
                    .precipitationRateMmH
                    .toFixed(
                        2
                    ) +
                " mm/h";
        }


        el.wxSnow.textContent =
            weather.snowDepthCm <
            0.1
                ? "0 cm"
                : weather
                    .snowDepthCm
                    .toFixed(
                        1
                    ) +
                    " cm";


        el.wxSurface.textContent =
            (
                weather.land
                    ? "Land"
                    : "Sea"
            ) +
            " · " +
            weather.biomeState
                .replaceAll(
                    "_",
                    " "
                ) +
            " · moisture " +
            Math.round(
                weather.humidityIndex *
                100
            ) +
            "%";
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

        const directions = [
            "N",
            "NE",
            "E",
            "SE",
            "S",
            "SW",
            "W",
            "NW"
        ];


        return directions[
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
                    locked -
                    Number(
                        PLAN.lockedHistoryHours ||
                        12
                    ) *
                    MS_HOUR;
            }
        }


        state.displayStart =
            start;


        state.displayEnd =
            blockEnd;


        state.currentTime =
            clamp(
                state.currentTime,
                state.displayStart,
                state.displayEnd
            );


        el.timelineStart.textContent =
            formatShortUTC(
                state.displayStart
            );


        el.timelineEnd.textContent =
            formatShortUTC(
                state.displayEnd
            );


        syncTimelineControls();
    }


    function sliderToTime(value) {

        return (
            state.displayStart +
            clamp(
                Number(
                    value
                ) /
                1000,
                0,
                1
            ) *
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


    function moveCurrentTime(hours) {

        setCurrentTime(
            state.currentTime +
            hours *
            MS_HOUR
        );
    }


    function currentPlanningState() {

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
            state.currentTime <=
            locked
        ) {

            return "LOCKED";
        }


        if (
            Number.isFinite(
                done
            ) &&
            state.currentTime <=
            done
        ) {

            return "DONE";
        }


        return "NOT DONE";
    }


    function updateTopStatus() {

        el.currentTime.textContent =
            formatDateTimeUTC(
                state.currentTime
            );


        el.planRange.textContent =
            formatShortUTC(
                Date.parse(
                    PLAN.planningBlock.start
                )
            ) +
            " → " +
            formatShortUTC(
                Date.parse(
                    PLAN.planningBlock.end
                )
            );


        const status =
            currentPlanningState();


        el.lockState.textContent =
            status;


        el.lockState.classList.toggle(
            "locked",
            status ===
            "LOCKED"
        );


        el.lockState.classList.toggle(
            "good",
            status ===
            "DONE"
        );


        if (
            status ===
            "LOCKED"
        ) {

            el.timelineMiddle.textContent =
                "LOCKED · view only";
        }
        else if (
            status ===
            "DONE"
        ) {

            el.timelineMiddle.textContent =
                "DONE · reviewed but editable";
        }
        else {

            el.timelineMiddle.textContent =
                "NOT DONE · editable";
        }
    }


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
            Number.isFinite(
                lock
            ) &&
            state.currentTime <
            lock
        ) {

            statusMessage(
                "Done state cannot move behind locked weather.",
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
            !Number.isFinite(
                done
            ) ||
            done <
            state.currentTime
        ) {

            statusMessage(
                "Mark this period Done before locking it.",
                "Not locked:"
            );

            return;
        }


        const previous =
            PLAN.completion
                .lockedThrough
                ? Date.parse(
                    PLAN.completion
                        .lockedThrough
                )
                : null;


        if (
            Number.isFinite(
                previous
            ) &&
            state.currentTime <=
            previous
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

        refreshEverything();


        statusMessage(
            "Weather permanently locked through " +
            formatDateTimeUTC(
                state.currentTime
            ) +
            ".",
            "Locked:"
        );
    }


    /* =====================================================================
       SAVE / LOAD / EXPORT
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

            console.error(
                error
            );


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


            PLAN.loadSerializable(
                JSON.parse(
                    raw
                )
            );


            return true;
        }
        catch (error) {

            console.error(
                error
            );


            return false;
        }
    }


    function resetLocalWorkingCopy() {

        const confirmed =
            window.confirm(
                "Reset the local working copy to europacraft-weather-plan.js?"
            );


        if (!confirmed) {
            return;
        }


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


        state.dirty =
            false;


        rebuildTimelineBounds();

        refreshEverything();


        statusMessage(
            "Local working copy reset."
        );
    }


    function downloadJSON(
        filename,
        data
    ) {

        const blob =
            new Blob(
                [
                    JSON.stringify(
                        data,
                        null,
                        2
                    )
                ],
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
            function () {

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
                2,

            engineVersion:
                ENGINE_VERSION,

            exportedAt:
                new Date().toISOString(),

            deterministic:
                true,

            externalApiRequired:
                false,

            elevationDataset: {
                file:
                    "europacraft-elevation.png",

                bounds:
                    deepCopy(
                        PLAN.bounds
                    ),

                seaPixel:
                    0,

                maxMetres:
                    DEM_MAX_METRES
            },

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


        statusMessage(
            "Server weather exported."
        );
    }


    /* =====================================================================
       EVENTS
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
                        function () {

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
            function () {

                el.mapCoordinates.textContent =
                    "—";
            }
        );


        el.timeSlider.addEventListener(
            "input",
            function () {

                setCurrentTime(
                    sliderToTime(
                        el.timeSlider.value
                    )
                );
            }
        );


        el.timeInput.addEventListener(
            "change",
            function () {

                const value =
                    parseDateTimeLocalAsUTC(
                        el.timeInput.value
                    );


                if (
                    Number.isFinite(
                        value
                    )
                ) {

                    setCurrentTime(
                        value
                    );
                }
                else {

                    syncTimelineControls();
                }
            }
        );


        el.minus6h.addEventListener(
            "click",
            function () {

                moveCurrentTime(
                    -6
                );
            }
        );


        el.minus1h.addEventListener(
            "click",
            function () {

                moveCurrentTime(
                    -1
                );
            }
        );


        el.plus1h.addEventListener(
            "click",
            function () {

                moveCurrentTime(
                    1
                );
            }
        );


        el.plus6h.addEventListener(
            "click",
            function () {

                moveCurrentTime(
                    6
                );
            }
        );


        el.deleteSelected.addEventListener(
            "click",
            deleteSelectedObject
        );


        el.duplicateSelected.addEventListener(
            "click",
            duplicateSelectedObject
        );


        const controls = [
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


        controls.forEach(
            control => {

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
        );


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
            "keydown",
            function (event) {

                const tag =
                    document.activeElement &&
                    document.activeElement
                        .tagName;


                if (
                    tag ===
                    "INPUT" ||
                    tag ===
                    "TEXTAREA" ||
                    tag ===
                    "SELECT"
                ) {

                    return;
                }


                if (
                    event.key ===
                    "Enter" &&
                    state.drawPathActive
                ) {

                    event.preventDefault();

                    finishAirPathDrawing();
                }


                if (
                    event.key ===
                    "Escape" &&
                    state.drawPathActive
                ) {

                    event.preventDefault();

                    cancelAirPathDrawing();
                }
            }
        );


        window.addEventListener(
            "beforeunload",
            function (event) {

                if (
                    !state.dirty
                ) {

                    return;
                }


                event.preventDefault();

                event.returnValue =
                    "";
            }
        );
    }


    /* =====================================================================
       REFRESH
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
       PUBLIC API
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
                    Number(
                        lat
                    ),
                    Number(
                        lon
                    )
                );
            },


        getElevation:
            function (
                lat,
                lon
            ) {

                return elevationM(
                    Number(
                        lat
                    ),
                    Number(
                        lon
                    )
                );
            },


        getBaselineTemperature:
            function (
                lat,
                lon,
                time
            ) {

                return baselineTemperature(
                    Number(
                        lat
                    ),
                    Number(
                        lon
                    ),
                    typeof time ===
                    "number"
                        ? time
                        : Date.parse(
                            time
                        )
                );
            },


        getWeatherFast:
            function (
                lat,
                lon,
                time
            ) {

                return calculateWeatherCore(
                    Number(
                        lat
                    ),
                    Number(
                        lon
                    ),
                    typeof time ===
                    "number"
                        ? time
                        : Date.parse(
                            time
                        )
                );
            },


        getWeather:
            function (
                lat,
                lon,
                time
            ) {

                return calculateWeather(
                    Number(
                        lat
                    ),
                    Number(
                        lon
                    ),
                    typeof time ===
                    "number"
                        ? time
                        : Date.parse(
                            time
                        ),
                    true
                );
            },


        setTime:
            function (time) {

                setCurrentTime(
                    typeof time ===
                    "number"
                        ? time
                        : Date.parse(
                            time
                        )
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


        installExtraToolbar();


        state.currentTime =
            Date.parse(
                PLAN.planningBlock.start
            );


        installEventListeners();

        rebuildTimelineBounds();

        resizeCanvas();

        refreshEverything();

        loadElevationDataset();


        console.info(
            "EuropaCraft Weather Planner ready",
            {
                version:
                    ENGINE_VERSION,

                objects:
                    PLAN.objects.length
            }
        );


        statusMessage(
            "Planner ready. Loading europacraft-elevation.png…"
        );
    }


    initialise();

})();
