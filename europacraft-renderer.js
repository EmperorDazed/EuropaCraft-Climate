/* ============================================================================
   EuropaCraft Weather Simulator
   Renderer
   File: europacraft-renderer.js
   Version 7.4

   COMPLETE REPLACEMENT

   FEATURES

   - Fast direct rendering from physics-grid arrays
   - Actual temperature
   - Temperature anomaly
   - Pressure
   - Wind
   - Cloud
   - Precipitation
   - Snow
   - Sea-surface temperature
   - Front strength
   - Permanent coastline overlay
   - Optional land shading
   - Pressure isobars
   - Wind vectors
   - Pressure-system markers
   - Steering arrows
   - Interactive drag-preview arrow
   - Mouse hover sampling

   IMPORTANT

   Weather is drawn continuously across land and sea.

   Geography is then drawn over the weather as a coastline so Europe remains
   visible without hiding atmospheric structures.
============================================================================ */

(function (global) {
"use strict";


const U = global.EuropaUtils;
const C = global.EuropaConfig;


if (!U) {
    throw new Error(
        "europacraft-renderer.js requires EuropaUtils."
    );
}


if (!C) {
    throw new Error(
        "europacraft-renderer.js requires EuropaConfig."
    );
}


/* ============================================================================
   DEFAULT OPTIONS
============================================================================ */

const DEFAULTS = Object.freeze({

    width:
        Number(
            C.display &&
            C.display.width
        ) || 780,

    height:
        Number(
            C.display &&
            C.display.height
        ) || 440,

    layer:
        (
            C.display &&
            C.display.defaultLayer
        ) || "temperature",

    isobars:
        C.display &&
        C.display.isobars !== undefined
            ? !!C.display.isobars
            : true,

    isobarIntervalHpa:
        Number(
            C.display &&
            C.display.isobarIntervalHpa
        ) || 4,

    windVectors:
        C.display &&
        C.display.windVectors !== undefined
            ? !!C.display.windVectors
            : false,

    windVectorSpacing:
        42,

    frontOverlay:
        false,

    systemMarkers:
        true,

    steeringArrows:
        true,

    coastline:
        true,

    landShading:
        true,

    dragToolEnabled:
        false,

    dragPreview:
        true
});


/* ============================================================================
   SMALL HELPERS
============================================================================ */

function clamp255(value) {

    return Math.max(
        0,
        Math.min(
            255,
            Math.round(
                value
            )
        )
    );
}


function rgba(
    r,
    g,
    b,
    a = 255
) {

    return [
        clamp255(r),
        clamp255(g),
        clamp255(b),
        clamp255(a)
    ];
}


function mixColour(
    a,
    b,
    t
) {

    t = U.clamp(
        t,
        0,
        1
    );


    return rgba(

        U.lerp(
            a[0],
            b[0],
            t
        ),

        U.lerp(
            a[1],
            b[1],
            t
        ),

        U.lerp(
            a[2],
            b[2],
            t
        ),

        U.lerp(
            a[3] === undefined ? 255 : a[3],
            b[3] === undefined ? 255 : b[3],
            t
        )
    );
}


function colourRamp(
    value,
    stops
) {

    if (
        value <=
        stops[0][0]
    ) {

        return stops[0][1];
    }


    const last = (
        stops[
            stops.length - 1
        ]
    );


    if (
        value >=
        last[0]
    ) {

        return last[1];
    }


    for (
        let i = 0;
        i <
        stops.length - 1;
        i++
    ) {

        const a = (
            stops[i]
        );


        const b = (
            stops[i + 1]
        );


        if (
            value >=
            a[0] &&
            value <=
            b[0]
        ) {

            const t = (

                (
                    value -
                    a[0]
                ) /

                (
                    b[0] -
                    a[0]
                )
            );


            return mixColour(
                a[1],
                b[1],
                t
            );
        }
    }


    return last[1];
}


function bilinearSample(
    field,
    nx,
    ny,
    x,
    y
) {

    if (
        !field ||
        !field.length
    ) {

        return 0;
    }


    x = U.clamp(
        x,
        0,
        nx - 1
    );


    y = U.clamp(
        y,
        0,
        ny - 1
    );


    const x0 = Math.floor(
        x
    );


    const y0 = Math.floor(
        y
    );


    const x1 = Math.min(
        nx - 1,
        x0 + 1
    );


    const y1 = Math.min(
        ny - 1,
        y0 + 1
    );


    const tx = (
        x -
        x0
    );


    const ty = (
        y -
        y0
    );


    const i00 = (
        y0 *
        nx +
        x0
    );


    const i10 = (
        y0 *
        nx +
        x1
    );


    const i01 = (
        y1 *
        nx +
        x0
    );


    const i11 = (
        y1 *
        nx +
        x1
    );


    return U.lerp(

        U.lerp(
            field[i00],
            field[i10],
            tx
        ),

        U.lerp(
            field[i01],
            field[i11],
            tx
        ),

        ty
    );
}


/* ============================================================================
   COLOUR SCALES
============================================================================ */

const TEMP_STOPS = [

    [-35, rgba(70, 35, 130)],
    [-25, rgba(72, 75, 180)],
    [-15, rgba(65, 135, 220)],
    [-8,  rgba(75, 190, 230)],
    [-2,  rgba(150, 225, 225)],
    [3,   rgba(195, 235, 170)],
    [8,   rgba(225, 235, 90)],
    [14,  rgba(245, 205, 75)],
    [20,  rgba(250, 155, 55)],
    [26,  rgba(235, 90, 45)],
    [32,  rgba(195, 45, 45)],
    [40,  rgba(125, 25, 30)]
];


const ANOMALY_STOPS = [

    [-15, rgba(45, 35, 130)],
    [-10, rgba(60, 80, 190)],
    [-6,  rgba(70, 145, 225)],
    [-3,  rgba(130, 195, 235)],
    [-1,  rgba(205, 230, 240)],
    [0,   rgba(235, 235, 225)],
    [1,   rgba(245, 220, 185)],
    [3,   rgba(245, 175, 110)],
    [6,   rgba(230, 105, 65)],
    [10,  rgba(185, 50, 50)],
    [15,  rgba(110, 25, 45)]
];


const PRESSURE_STOPS = [

    [960,  rgba(70, 60, 150)],
    [980,  rgba(75, 115, 195)],
    [995,  rgba(105, 175, 210)],
    [1010, rgba(180, 220, 180)],
    [1020, rgba(225, 225, 125)],
    [1030, rgba(245, 175, 75)],
    [1045, rgba(220, 90, 60)]
];


const WIND_STOPS = [

    [0,  rgba(225, 235, 225)],
    [3,  rgba(175, 220, 195)],
    [7,  rgba(100, 190, 185)],
    [12, rgba(65, 145, 190)],
    [18, rgba(85, 100, 175)],
    [25, rgba(120, 65, 155)],
    [35, rgba(165, 50, 120)],
    [50, rgba(205, 45, 70)]
];


const CLOUD_STOPS = [

    [0, rgba(38, 52, 62)],
    [0.15, rgba(72, 84, 92)],
    [0.35, rgba(110, 120, 125)],
    [0.60, rgba(155, 160, 162)],
    [0.80, rgba(205, 207, 207)],
    [1.00, rgba(245, 245, 245)]
];


const PRECIP_STOPS = [

    [0, rgba(25, 40, 50)],
    [0.05, rgba(80, 110, 130)],
    [0.2, rgba(70, 160, 185)],
    [1, rgba(65, 190, 120)],
    [3, rgba(220, 205, 70)],
    [8, rgba(235, 135, 55)],
    [20, rgba(210, 65, 55)],
    [50, rgba(155, 45, 130)],
    [80, rgba(90, 35, 115)]
];


const SNOW_STOPS = [

    [0, rgba(40, 55, 60)],
    [0.1, rgba(135, 170, 185)],
    [1, rgba(180, 210, 225)],
    [5, rgba(220, 235, 245)],
    [15, rgba(245, 248, 250)],
    [40, rgba(220, 225, 250)],
    [100, rgba(180, 185, 240)]
];


const SST_STOPS = [

    [-2, rgba(70, 100, 180)],
    [2, rgba(75, 145, 205)],
    [6, rgba(90, 185, 210)],
    [10, rgba(120, 210, 185)],
    [15, rgba(210, 220, 105)],
    [20, rgba(245, 180, 70)],
    [25, rgba(235, 110, 55)],
    [30, rgba(180, 55, 50)]
];


const FRONT_STOPS = [

    [0, rgba(40, 50, 55)],
    [0.1, rgba(60, 90, 105)],
    [0.25, rgba(80, 140, 170)],
    [0.5, rgba(210, 210, 90)],
    [0.75, rgba(240, 135, 60)],
    [1, rgba(220, 55, 55)]
];


const COLOUR_SCALES = Object.freeze({

    temperature:
        TEMP_STOPS,

    anomaly:
        ANOMALY_STOPS,

    pressure:
        PRESSURE_STOPS,

    wind:
        WIND_STOPS,

    cloud:
        CLOUD_STOPS,

    precipitation:
        PRECIP_STOPS,

    snow:
        SNOW_STOPS,

    sst:
        SST_STOPS,

    fronts:
        FRONT_STOPS
});


/* ============================================================================
   RENDERER
============================================================================ */

class EuropaRenderer {

    constructor(
        weather,
        canvasOrId,
        options = {}
    ) {

        if (
            !weather
        ) {

            throw new Error(
                "EuropaRenderer requires a EuropaWeather controller."
            );
        }


        this.weather = (
            weather
        );


        this.canvas = (

            typeof canvasOrId ===
            "string"

                ? document.getElementById(
                    canvasOrId
                )

                : canvasOrId
        );


        if (
            !this.canvas
        ) {

            throw new Error(
                "EuropaRenderer could not find its canvas."
            );
        }


        this.ctx = (
            this.canvas.getContext(
                "2d"
            )
        );


        if (
            !this.ctx
        ) {

            throw new Error(
                "EuropaRenderer could not obtain a 2D canvas context."
            );
        }


        this.options = Object.assign(
            {},
            DEFAULTS,
            options
        );


        this.width = (
            Number(
                this.options.width
            ) ||
            DEFAULTS.width
        );


        this.height = (
            Number(
                this.options.height
            ) ||
            DEFAULTS.height
        );


        this.canvas.width = (
            this.width
        );


        this.canvas.height = (
            this.height
        );


        this.layer = (
            this.options.layer
        );


        this.fields = null;


        this.lastRenderMs = (
            0
        );


        this.lastHover = null;


        this.drag = {

            active:
                false,

            startX:
                0,

            startY:
                0,

            endX:
                0,

            endY:
                0,

            startLat:
                0,

            startLon:
                0,

            endLat:
                0,

            endLon:
                0
        };


        this._imageData = (
            this.ctx.createImageData(
                this.width,
                this.height
            )
        );


        this._displayX = (
            new Float32Array(
                this.width
            )
        );


        this._displayY = (
            new Float32Array(
                this.height
            )
        );


        this._buildLookup();

        this._bindPointerEvents();

        this.render();
    }


    /* ========================================================================
       PHYSICS LOOKUP
       ======================================================================== */

    _buildLookup() {

        const fields = (
            this.weather.getFields()
        );


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        for (
            let x = 0;
            x <
            this.width;
            x++
        ) {

            this._displayX[x] = (

                x /
                Math.max(
                    1,
                    this.width - 1
                ) *

                (
                    nx - 1
                )
            );
        }


        for (
            let y = 0;
            y <
            this.height;
            y++
        ) {

            this._displayY[y] = (

                y /
                Math.max(
                    1,
                    this.height - 1
                ) *

                (
                    ny - 1
                )
            );
        }
    }


    /* ========================================================================
       COORDINATES
       ======================================================================== */

    pixelToGeo(
        x,
        y
    ) {

        const lon = U.lerp(

            C.bounds.west,

            C.bounds.east,

            x /
            Math.max(
                1,
                this.width
            )
        );


        const lat = U.lerp(

            C.bounds.north,

            C.bounds.south,

            y /
            Math.max(
                1,
                this.height
            )
        );


        return {
            lat,
            lon
        };
    }


    geoToPixel(
        lat,
        lon
    ) {

        return {

            x:
                (
                    lon -
                    C.bounds.west
                ) /
                (
                    C.bounds.east -
                    C.bounds.west
                ) *
                this.width,

            y:
                (
                    C.bounds.north -
                    lat
                ) /
                (
                    C.bounds.north -
                    C.bounds.south
                ) *
                this.height
        };
    }


    _eventPosition(
        event
    ) {

        const rect = (
            this.canvas.getBoundingClientRect()
        );


        return {

            x:
                (
                    event.clientX -
                    rect.left
                ) *
                this.width /
                rect.width,

            y:
                (
                    event.clientY -
                    rect.top
                ) *
                this.height /
                rect.height
        };
    }


    /* ========================================================================
       POINTER EVENTS
       ======================================================================== */

    _bindPointerEvents() {

        this._onPointerDown = event => {

            const p = (
                this._eventPosition(
                    event
                )
            );


            if (
                this.options.dragToolEnabled
            ) {

                const geo = (
                    this.pixelToGeo(
                        p.x,
                        p.y
                    )
                );


                this.drag.active = (
                    true
                );


                this.drag.startX = (
                    p.x
                );


                this.drag.startY = (
                    p.y
                );


                this.drag.endX = (
                    p.x
                );


                this.drag.endY = (
                    p.y
                );


                this.drag.startLat = (
                    geo.lat
                );


                this.drag.startLon = (
                    geo.lon
                );


                this.drag.endLat = (
                    geo.lat
                );


                this.drag.endLon = (
                    geo.lon
                );


                this.canvas.setPointerCapture(
                    event.pointerId
                );


                event.preventDefault();

                this.render();

                return;
            }


            this._updateHover(
                p.x,
                p.y
            );
        };


        this._onPointerMove = event => {

            const p = (
                this._eventPosition(
                    event
                )
            );


            if (
                this.drag.active
            ) {

                const geo = (
                    this.pixelToGeo(
                        p.x,
                        p.y
                    )
                );


                this.drag.endX = (
                    p.x
                );


                this.drag.endY = (
                    p.y
                );


                this.drag.endLat = (
                    geo.lat
                );


                this.drag.endLon = (
                    geo.lon
                );


                if (
                    typeof this.options.onSteeringPreview ===
                    "function"
                ) {

                    this.options.onSteeringPreview({

                        sourceLat:
                            this.drag.startLat,

                        sourceLon:
                            this.drag.startLon,

                        targetLat:
                            this.drag.endLat,

                        targetLon:
                            this.drag.endLon,

                        distanceKm:
                            U.haversineKm(

                                this.drag.startLat,

                                this.drag.startLon,

                                this.drag.endLat,

                                this.drag.endLon
                            )
                    });
                }


                this.render();

                event.preventDefault();

                return;
            }


            this._updateHover(
                p.x,
                p.y
            );
        };


        this._onPointerUp = event => {

            if (
                !this.drag.active
            ) {

                return;
            }


            const p = (
                this._eventPosition(
                    event
                )
            );


            const geo = (
                this.pixelToGeo(
                    p.x,
                    p.y
                )
            );


            this.drag.endX = (
                p.x
            );


            this.drag.endY = (
                p.y
            );


            this.drag.endLat = (
                geo.lat
            );


            this.drag.endLon = (
                geo.lon
            );


            const distanceKm = (
                U.haversineKm(

                    this.drag.startLat,

                    this.drag.startLon,

                    this.drag.endLat,

                    this.drag.endLon
                )
            );


            const payload = {

                sourceLat:
                    this.drag.startLat,

                sourceLon:
                    this.drag.startLon,

                targetLat:
                    this.drag.endLat,

                targetLon:
                    this.drag.endLon,

                distanceKm
            };


            this.drag.active = (
                false
            );


            try {

                this.canvas.releasePointerCapture(
                    event.pointerId
                );

            } catch (error) {

                /*
                 * Harmless if pointer capture already ended.
                 */
            }


            if (
                distanceKm >=
                40 &&
                typeof this.options.onSteeringDrag ===
                "function"
            ) {

                this.options.onSteeringDrag(
                    payload
                );
            }


            this.render();

            event.preventDefault();
        };


        this._onPointerCancel = () => {

            this.drag.active = (
                false
            );


            this.render();
        };


        this.canvas.addEventListener(
            "pointerdown",
            this._onPointerDown
        );


        this.canvas.addEventListener(
            "pointermove",
            this._onPointerMove
        );


        this.canvas.addEventListener(
            "pointerup",
            this._onPointerUp
        );


        this.canvas.addEventListener(
            "pointercancel",
            this._onPointerCancel
        );


        this.canvas.addEventListener(
            "pointerleave",
            () => {

                if (
                    !this.drag.active
                ) {

                    this.lastHover = null;
                }
            }
        );
    }


    _updateHover(
        x,
        y
    ) {

        const geo = (
            this.pixelToGeo(
                x,
                y
            )
        );


        let sample = null;


        try {

            sample = (
                this.weather.sample(
                    geo.lat,
                    geo.lon
                )
            );

        } catch (error) {

            sample = null;
        }


        const data = {

            x,

            y,

            lat:
                geo.lat,

            lon:
                geo.lon,

            sample
        };


        this.lastHover = (
            data
        );


        if (
            typeof this.options.onHover ===
            "function"
        ) {

            this.options.onHover(
                data
            );
        }
    }


    /* ========================================================================
       FIELD SELECTION
       ======================================================================== */

    _fieldForLayer(
        fields
    ) {

        switch (
            this.layer
        ) {

            case "temperature":
                return fields.temperatureC;

            case "anomaly":
                return fields.anomalyC;

            case "pressure":
                return fields.pressureHpa;

            case "wind":
                return fields.windSpeed;

            case "cloud":
                return fields.cloudFraction;

            case "precipitation":
                return fields.precipRateMmHr;

            case "snow":
                return fields.snowDepthCm;

            case "sst":
                return fields.sst;

            case "fronts":
                return fields.frontStrength;

            default:
                return fields.temperatureC;
        }
    }


    _colourForValue(
        value
    ) {

        switch (
            this.layer
        ) {

            case "temperature":
                return colourRamp(
                    value,
                    TEMP_STOPS
                );

            case "anomaly":
                return colourRamp(
                    value,
                    ANOMALY_STOPS
                );

            case "pressure":
                return colourRamp(
                    value,
                    PRESSURE_STOPS
                );

            case "wind":
                return colourRamp(
                    value,
                    WIND_STOPS
                );

            case "cloud":
                return colourRamp(
                    value,
                    CLOUD_STOPS
                );

            case "precipitation":
                return colourRamp(
                    value,
                    PRECIP_STOPS
                );

            case "snow":
                return colourRamp(
                    value,
                    SNOW_STOPS
                );

            case "sst":
                return colourRamp(
                    value,
                    SST_STOPS
                );

            case "fronts":
                return colourRamp(
                    value,
                    FRONT_STOPS
                );

            default:
                return rgba(
                    120,
                    120,
                    120
                );
        }
    }


    /* ========================================================================
       BASE WEATHER IMAGE
       ======================================================================== */

    _renderBase(
        fields
    ) {

        const field = (
            this._fieldForLayer(
                fields
            )
        );


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        const data = (
            this._imageData.data
        );


        let p = 0;


        for (
            let y = 0;
            y <
            this.height;
            y++
        ) {

            const gy = (
                this._displayY[y]
            );


            for (
                let x = 0;
                x <
                this.width;
                x++
            ) {

                const gx = (
                    this._displayX[x]
                );


                let value = (
                    bilinearSample(

                        field,

                        nx,

                        ny,

                        gx,

                        gy
                    )
                );


                /*
                 * SST has no meaningful value over land.

                 * Keep the land visible but neutral.
                 */

                if (
                    this.layer ===
                    "sst" &&
                    fields.land
                ) {

                    const land = (
                        bilinearSample(

                            fields.land,

                            nx,

                            ny,

                            gx,

                            gy
                        )
                    );


                    if (
                        land >
                        0.5
                    ) {

                        data[p++] = (
                            70
                        );

                        data[p++] = (
                            74
                        );

                        data[p++] = (
                            68
                        );

                        data[p++] = (
                            255
                        );

                        continue;
                    }
                }


                const colour = (
                    this._colourForValue(
                        value
                    )
                );


                data[p++] = (
                    colour[0]
                );


                data[p++] = (
                    colour[1]
                );


                data[p++] = (
                    colour[2]
                );


                data[p++] = (
                    255
                );
            }
        }


        this.ctx.putImageData(
            this._imageData,
            0,
            0
        );
    }


    /* ========================================================================
       LAND SHADING
       ======================================================================== */

    _drawLandShading(
        fields
    ) {

        if (
            !this.options.landShading ||
            !fields.land
        ) {

            return;
        }


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        this.ctx.save();


        /*
         * A very faint tint only.

         * Atmospheric colours remain dominant.
         */

        this.ctx.fillStyle = (
            "rgba(30, 22, 10, 0.055)"
        );


        const cellWidth = (
            this.width /
            nx
        );


        const cellHeight = (
            this.height /
            ny
        );


        for (
            let y = 0;
            y <
            ny;
            y++
        ) {

            for (
                let x = 0;
                x <
                nx;
                x++
            ) {

                const i = (
                    y *
                    nx +
                    x
                );


                if (
                    fields.land[i] >
                    0.5
                ) {

                    this.ctx.fillRect(

                        x *
                        cellWidth,

                        y *
                        cellHeight,

                        cellWidth +
                        1,

                        cellHeight +
                        1
                    );
                }
            }
        }


        this.ctx.restore();
    }


    /* ========================================================================
       COASTLINE

       Uses the physics land mask and draws boundaries where neighbouring
       cells switch between land and water.
       ======================================================================== */

    _drawCoastline(
        fields
    ) {

        if (
            !this.options.coastline ||
            !fields.land
        ) {

            return;
        }


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        const dx = (
            this.width /
            (
                nx - 1
            )
        );


        const dy = (
            this.height /
            (
                ny - 1
            )
        );


        this.ctx.save();


        this.ctx.strokeStyle = (
            "rgba(25, 28, 27, 0.82)"
        );


        this.ctx.lineWidth = (
            1.15
        );


        this.ctx.lineJoin = (
            "round"
        );


        this.ctx.lineCap = (
            "round"
        );


        this.ctx.beginPath();


        for (
            let y = 0;
            y <
            ny - 1;
            y++
        ) {

            for (
                let x = 0;
                x <
                nx - 1;
                x++
            ) {

                const i = (
                    y *
                    nx +
                    x
                );


                const here = (
                    fields.land[i] >=
                    0.5
                );


                const right = (
                    fields.land[
                        i + 1
                    ] >=
                    0.5
                );


                const below = (
                    fields.land[
                        i + nx
                    ] >=
                    0.5
                );


                if (
                    here !==
                    right
                ) {

                    const px = (
                        (
                            x +
                            0.5
                        ) *
                        dx
                    );


                    const py0 = (
                        y *
                        dy
                    );


                    const py1 = (
                        (
                            y +
                            1
                        ) *
                        dy
                    );


                    this.ctx.moveTo(
                        px,
                        py0
                    );


                    this.ctx.lineTo(
                        px,
                        py1
                    );
                }


                if (
                    here !==
                    below
                ) {

                    const py = (
                        (
                            y +
                            0.5
                        ) *
                        dy
                    );


                    const px0 = (
                        x *
                        dx
                    );


                    const px1 = (
                        (
                            x +
                            1
                        ) *
                        dx
                    );


                    this.ctx.moveTo(
                        px0,
                        py
                    );


                    this.ctx.lineTo(
                        px1,
                        py
                    );
                }
            }
        }


        this.ctx.stroke();

        this.ctx.restore();
    }


    /* ========================================================================
       ISOBARS
       ======================================================================== */

    _drawIsobars(
        fields
    ) {

        if (
            !this.options.isobars ||
            !fields.pressureHpa
        ) {

            return;
        }


        const pressure = (
            fields.pressureHpa
        );


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        let minP = (
            Infinity
        );


        let maxP = (
            -Infinity
        );


        for (
            let i = 0;
            i <
            pressure.length;
            i++
        ) {

            const p = (
                pressure[i]
            );


            if (
                p <
                minP
            ) {

                minP = (
                    p
                );
            }


            if (
                p >
                maxP
            ) {

                maxP = (
                    p
                );
            }
        }


        const interval = Math.max(

            1,

            Number(
                this.options.isobarIntervalHpa
            ) ||
            4
        );


        const first = (

            Math.ceil(
                minP /
                interval
            ) *
            interval
        );


        const last = (

            Math.floor(
                maxP /
                interval
            ) *
            interval
        );


        this.ctx.save();


        this.ctx.strokeStyle = (
            "rgba(45, 48, 46, 0.58)"
        );


        this.ctx.lineWidth = (
            1
        );


        const dx = (
            this.width /
            (
                nx - 1
            )
        );


        const dy = (
            this.height /
            (
                ny - 1
            )
        );


        for (
            let level = first;
            level <= last;
            level += interval
        ) {

            this.ctx.beginPath();


            for (
                let y = 0;
                y <
                ny - 1;
                y++
            ) {

                for (
                    let x = 0;
                    x <
                    nx - 1;
                    x++
                ) {

                    const i00 = (
                        y *
                        nx +
                        x
                    );


                    const i10 = (
                        i00 +
                        1
                    );


                    const i01 = (
                        i00 +
                        nx
                    );


                    const i11 = (
                        i01 +
                        1
                    );


                    const v00 = (
                        pressure[i00]
                    );


                    const v10 = (
                        pressure[i10]
                    );


                    const v01 = (
                        pressure[i01]
                    );


                    const v11 = (
                        pressure[i11]
                    );


                    const points = [];


                    function edge(
                        ax,
                        ay,
                        av,
                        bx,
                        by,
                        bv
                    ) {

                        if (
                            (
                                av <
                                level &&
                                bv >=
                                level
                            ) ||
                            (
                                av >=
                                level &&
                                bv <
                                level
                            )
                        ) {

                            const t = (

                                (
                                    level -
                                    av
                                ) /

                                (
                                    bv -
                                    av
                                )
                            );


                            points.push({

                                x:
                                    U.lerp(
                                        ax,
                                        bx,
                                        t
                                    ),

                                y:
                                    U.lerp(
                                        ay,
                                        by,
                                        t
                                    )
                            });
                        }
                    }


                    edge(
                        x,
                        y,
                        v00,
                        x + 1,
                        y,
                        v10
                    );


                    edge(
                        x + 1,
                        y,
                        v10,
                        x + 1,
                        y + 1,
                        v11
                    );


                    edge(
                        x + 1,
                        y + 1,
                        v11,
                        x,
                        y + 1,
                        v01
                    );


                    edge(
                        x,
                        y + 1,
                        v01,
                        x,
                        y,
                        v00
                    );


                    if (
                        points.length >=
                        2
                    ) {

                        this.ctx.moveTo(

                            points[0].x *
                            dx,

                            points[0].y *
                            dy
                        );


                        this.ctx.lineTo(

                            points[1].x *
                            dx,

                            points[1].y *
                            dy
                        );
                    }
                }
            }


            this.ctx.stroke();
        }


        this.ctx.restore();
    }


    /* ========================================================================
       WIND VECTORS
       ======================================================================== */

    _drawWindVectors(
        fields
    ) {

        if (
            !this.options.windVectors ||
            !fields.windU ||
            !fields.windV
        ) {

            return;
        }


        const spacing = Math.max(

            24,

            Number(
                this.options.windVectorSpacing
            ) ||
            42
        );


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        this.ctx.save();


        this.ctx.strokeStyle = (
            "rgba(20, 25, 30, 0.70)"
        );


        this.ctx.fillStyle = (
            "rgba(20, 25, 30, 0.70)"
        );


        this.ctx.lineWidth = (
            1.2
        );


        for (
            let py = spacing / 2;
            py <
            this.height;
            py += spacing
        ) {

            for (
                let px = spacing / 2;
                px <
                this.width;
                px += spacing
            ) {

                const gx = (

                    px /
                    this.width *
                    (
                        nx - 1
                    )
                );


                const gy = (

                    py /
                    this.height *
                    (
                        ny - 1
                    )
                );


                const u = (
                    bilinearSample(
                        fields.windU,
                        nx,
                        ny,
                        gx,
                        gy
                    )
                );


                const v = (
                    bilinearSample(
                        fields.windV,
                        nx,
                        ny,
                        gx,
                        gy
                    )
                );


                const speed = (
                    Math.hypot(
                        u,
                        v
                    )
                );


                if (
                    speed <
                    0.25
                ) {

                    continue;
                }


                const scale = (

                    7 +

                    Math.min(
                        12,
                        speed *
                        0.45
                    )
                );


                const dx = (

                    u /
                    speed *
                    scale
                );


                /*
                 * Canvas Y increases southward, while positive v is north.
                 */

                const dy = (

                    -v /
                    speed *
                    scale
                );


                const x2 = (
                    px +
                    dx
                );


                const y2 = (
                    py +
                    dy
                );


                this.ctx.beginPath();


                this.ctx.moveTo(
                    px,
                    py
                );


                this.ctx.lineTo(
                    x2,
                    y2
                );


                this.ctx.stroke();


                const angle = (
                    Math.atan2(
                        dy,
                        dx
                    )
                );


                const head = (
                    4
                );


                this.ctx.beginPath();


                this.ctx.moveTo(
                    x2,
                    y2
                );


                this.ctx.lineTo(

                    x2 -
                    Math.cos(
                        angle -
                        0.55
                    ) *
                    head,

                    y2 -
                    Math.sin(
                        angle -
                        0.55
                    ) *
                    head
                );


                this.ctx.lineTo(

                    x2 -
                    Math.cos(
                        angle +
                        0.55
                    ) *
                    head,

                    y2 -
                    Math.sin(
                        angle +
                        0.55
                    ) *
                    head
                );


                this.ctx.closePath();

                this.ctx.fill();
            }
        }


        this.ctx.restore();
    }


    /* ========================================================================
       SYSTEM MARKERS
       ======================================================================== */

    _drawSystems() {

        if (
            !this.options.systemMarkers
        ) {

            return;
        }


        let systems = [];


        try {

            if (
                typeof this.weather.getSystems ===
                "function"
            ) {

                systems = (
                    this.weather.getSystems() ||
                    []
                );

            } else if (
                this.weather.synoptic &&
                Array.isArray(
                    this.weather.synoptic.systems
                )
            ) {

                systems = (
                    this.weather.synoptic.systems
                );
            }

        } catch (error) {

            systems = [];
        }


        this.ctx.save();


        this.ctx.textAlign = (
            "center"
        );


        this.ctx.textBaseline = (
            "middle"
        );


        for (
            const system
            of systems
        ) {

            if (
                system.active ===
                false
            ) {

                continue;
            }


            const p = (
                this.geoToPixel(
                    system.lat,
                    system.lon
                )
            );


            const isLow = (

                String(
                    system.type
                ).toLowerCase() ===
                "low"
            );


            this.ctx.font = (
                "bold 28px Arial"
            );


            this.ctx.fillStyle = isLow
                ? "rgba(40, 85, 220, 0.88)"
                : "rgba(220, 70, 55, 0.88)";


            this.ctx.fillText(

                isLow
                    ? "L"
                    : "H",

                p.x,

                p.y - 5
            );


            this.ctx.font = (
                "bold 13px Arial"
            );


            this.ctx.fillText(

                `${Math.round(
                    finite(
                        system.pressureHpa,
                        1013
                    )
                )} hPa`,

                p.x,

                p.y + 19
            );
        }


        this.ctx.restore();
    }


    /* ========================================================================
       STEERING ARROW DRAWING
       ======================================================================== */

    _drawArrowLine(
        sourceLat,
        sourceLon,
        targetLat,
        targetLon,
        options = {}
    ) {

        const a = (
            this.geoToPixel(
                sourceLat,
                sourceLon
            )
        );


        const b = (
            this.geoToPixel(
                targetLat,
                targetLon
            )
        );


        const dx = (
            b.x -
            a.x
        );


        const dy = (
            b.y -
            a.y
        );


        const length = (
            Math.hypot(
                dx,
                dy
            )
        );


        if (
            length <
            2
        ) {

            return;
        }


        const angle = (
            Math.atan2(
                dy,
                dx
            )
        );


        const preview = (
            !!options.preview
        );


        this.ctx.save();


        this.ctx.lineWidth = preview
            ? 3
            : 2.4;


        this.ctx.strokeStyle = preview
            ? "rgba(255, 255, 255, 0.95)"
            : "rgba(45, 35, 25, 0.90)";


        this.ctx.fillStyle = (
            this.ctx.strokeStyle
        );


        if (
            preview
        ) {

            this.ctx.setLineDash([
                8,
                5
            ]);
        }


        this.ctx.beginPath();


        this.ctx.moveTo(
            a.x,
            a.y
        );


        this.ctx.lineTo(
            b.x,
            b.y
        );


        this.ctx.stroke();


        this.ctx.setLineDash([]);


        const headSize = (
            preview
                ? 13
                : 11
        );


        this.ctx.beginPath();


        this.ctx.moveTo(
            b.x,
            b.y
        );


        this.ctx.lineTo(

            b.x -
            Math.cos(
                angle -
                0.55
            ) *
            headSize,

            b.y -
            Math.sin(
                angle -
                0.55
            ) *
            headSize
        );


        this.ctx.lineTo(

            b.x -
            Math.cos(
                angle +
                0.55
            ) *
            headSize,

            b.y -
            Math.sin(
                angle +
                0.55
            ) *
            headSize
        );


        this.ctx.closePath();

        this.ctx.fill();


        /*
         * Source marker.
         */

        this.ctx.beginPath();


        this.ctx.arc(
            a.x,
            a.y,
            4,
            0,
            Math.PI * 2
        );


        this.ctx.fill();


        this.ctx.restore();
    }


    _drawSteeringArrows() {

        if (
            !this.options.steeringArrows
        ) {

            return;
        }


        let arrows = [];


        try {

            if (
                typeof this.weather.getSteeringArrows ===
                "function"
            ) {

                arrows = (
                    this.weather.getSteeringArrows() ||
                    []
                );

            } else if (
                this.weather.synoptic &&
                Array.isArray(
                    this.weather.synoptic.arrows
                )
            ) {

                arrows = (
                    this.weather.synoptic.arrows
                );
            }

        } catch (error) {

            arrows = [];
        }


        for (
            const arrow
            of arrows
        ) {

            const sourceLat = finite(

                arrow.sourceLat !== undefined
                    ? arrow.sourceLat
                    : arrow.lat1,

                NaN
            );


            const sourceLon = finite(

                arrow.sourceLon !== undefined
                    ? arrow.sourceLon
                    : arrow.lon1,

                NaN
            );


            const targetLat = finite(

                arrow.targetLat !== undefined
                    ? arrow.targetLat
                    : arrow.lat2,

                NaN
            );


            const targetLon = finite(

                arrow.targetLon !== undefined
                    ? arrow.targetLon
                    : arrow.lon2,

                NaN
            );


            if (
                !Number.isFinite(
                    sourceLat
                ) ||
                !Number.isFinite(
                    sourceLon
                ) ||
                !Number.isFinite(
                    targetLat
                ) ||
                !Number.isFinite(
                    targetLon
                )
            ) {

                continue;
            }


            this._drawArrowLine(

                sourceLat,

                sourceLon,

                targetLat,

                targetLon
            );
        }
    }


    _drawDragPreview() {

        if (
            !this.options.dragPreview ||
            !this.drag.active
        ) {

            return;
        }


        this._drawArrowLine(

            this.drag.startLat,

            this.drag.startLon,

            this.drag.endLat,

            this.drag.endLon,

            {
                preview:
                    true
            }
        );
    }


    /* ========================================================================
       FRONT OVERLAY
       ======================================================================== */

    _drawFrontOverlay(
        fields
    ) {

        if (
            !this.options.frontOverlay ||
            !fields.frontStrength
        ) {

            return;
        }


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        const dx = (
            this.width /
            nx
        );


        const dy = (
            this.height /
            ny
        );


        this.ctx.save();


        for (
            let y = 0;
            y <
            ny;
            y++
        ) {

            for (
                let x = 0;
                x <
                nx;
                x++
            ) {

                const i = (
                    y *
                    nx +
                    x
                );


                const strength = U.clamp(

                    fields.frontStrength[i],

                    0,

                    1
                );


                if (
                    strength <
                    0.35
                ) {

                    continue;
                }


                this.ctx.fillStyle = (

                    `rgba(255,255,255,${
                        0.03 +
                        strength *
                        0.16
                    })`
                );


                this.ctx.fillRect(

                    x *
                    dx,

                    y *
                    dy,

                    dx +
                    1,

                    dy +
                    1
                );
            }
        }


        this.ctx.restore();
    }


    /* ========================================================================
       MAIN RENDER
       ======================================================================== */

    render() {

        const started = (
            performance.now()
        );


        const fields = (
            this.weather.getFields()
        );


        this.fields = (
            fields
        );


        this._renderBase(
            fields
        );


        this._drawLandShading(
            fields
        );


        this._drawFrontOverlay(
            fields
        );


        this._drawIsobars(
            fields
        );


        this._drawCoastline(
            fields
        );


        this._drawWindVectors(
            fields
        );


        this._drawSystems();


        this._drawSteeringArrows();


        this._drawDragPreview();


        this.lastRenderMs = (

            performance.now() -
            started
        );


        return this;
    }


    /* ========================================================================
       CONTROLS
       ======================================================================== */

    setLayer(
        layer
    ) {

        this.layer = (
            layer
        );


        this.options.layer = (
            layer
        );


        this.render();

        return this;
    }


    setIsobars(
        enabled
    ) {

        this.options.isobars = (
            !!enabled
        );


        this.render();

        return this;
    }


    setWindVectors(
        enabled
    ) {

        this.options.windVectors = (
            !!enabled
        );


        this.render();

        return this;
    }


    setFrontOverlay(
        enabled
    ) {

        this.options.frontOverlay = (
            !!enabled
        );


        this.render();

        return this;
    }


    setSystemMarkers(
        enabled
    ) {

        this.options.systemMarkers = (
            !!enabled
        );


        this.render();

        return this;
    }


    setSteeringArrows(
        enabled
    ) {

        this.options.steeringArrows = (
            !!enabled
        );


        this.render();

        return this;
    }


    setCoastline(
        enabled
    ) {

        this.options.coastline = (
            !!enabled
        );


        this.render();

        return this;
    }


    setLandShading(
        enabled
    ) {

        this.options.landShading = (
            !!enabled
        );


        this.render();

        return this;
    }


    setDragToolEnabled(
        enabled
    ) {

        this.options.dragToolEnabled = (
            !!enabled
        );


        this.canvas.style.cursor = enabled
            ? "crosshair"
            : "default";


        if (
            !enabled
        ) {

            this.drag.active = (
                false
            );
        }


        this.render();

        return this;
    }


    resize(
        width,
        height
    ) {

        this.width = Math.max(
            1,
            Math.floor(
                width
            )
        );


        this.height = Math.max(
            1,
            Math.floor(
                height
            )
        );


        this.canvas.width = (
            this.width
        );


        this.canvas.height = (
            this.height
        );


        this._imageData = (
            this.ctx.createImageData(
                this.width,
                this.height
            )
        );


        this._displayX = (
            new Float32Array(
                this.width
            )
        );


        this._displayY = (
            new Float32Array(
                this.height
            )
        );


        this._buildLookup();

        this.render();

        return this;
    }


    getInfo() {

        return {

            width:
                this.width,

            height:
                this.height,

            layer:
                this.layer,

            lastRenderMs:
                this.lastRenderMs,

            coastline:
                !!this.options.coastline,

            landShading:
                !!this.options.landShading,

            dragToolEnabled:
                !!this.options.dragToolEnabled
        };
    }


    destroy() {

        this.canvas.removeEventListener(
            "pointerdown",
            this._onPointerDown
        );


        this.canvas.removeEventListener(
            "pointermove",
            this._onPointerMove
        );


        this.canvas.removeEventListener(
            "pointerup",
            this._onPointerUp
        );


        this.canvas.removeEventListener(
            "pointercancel",
            this._onPointerCancel
        );
    }
}


/* ============================================================================
   NUMBER HELPER USED BY SYSTEM LABELS
============================================================================ */

function finite(
    value,
    fallback = 0
) {

    const number = Number(
        value
    );


    return Number.isFinite(
        number
    )
        ? number
        : fallback;
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaRenderer = (
    EuropaRenderer
);


global.EuropaRendererDefaults = (
    DEFAULTS
);


global.EuropaRendererColourScales = (
    COLOUR_SCALES
);

})(window);
