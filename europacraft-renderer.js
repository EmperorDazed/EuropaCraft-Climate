/* ============================================================================
   EuropaCraft Weather Simulator
   Weather Map Renderer
   Version 7.2

   NEW FILE

   PURPOSE

   Renders the 195 x 110 atmospheric physics grid onto the higher-resolution
   EuropaCraft map display.

   DEFAULT DISPLAY:
       780 x 440 pixels

   IMPORTANT PERFORMANCE DESIGN

   The OLD architecture could call weather.sample() once for every display
   pixel.

   780 x 440 =
       343,200 separate sampling calls per redraw.

   This renderer does NOT do that.

   Instead it:

       1. obtains the raw atmospheric arrays once
       2. converts each display pixel to physics-grid coordinates
       3. performs direct bilinear interpolation
       4. renders into one ImageData object
       5. sends the completed image to the canvas

   The actual atmospheric physics therefore remains 195 x 110 while the map
   can look visually smooth at 780 x 440 or other resolutions.

   AVAILABLE LAYERS

       temperature
       anomaly
       pressure
       wind
       cloud
       precipitation
       snow
       sst
       fronts

   OPTIONAL OVERLAYS

       pressure isobars
       wind vectors
       steering arrows
       synoptic system markers

============================================================================ */

(function (global) {
"use strict";


const U = global.EuropaUtils;
const C = global.EuropaConfig;


/* ============================================================================
   DEFAULTS
============================================================================ */

const DEFAULTS = Object.freeze({

    width:
        780,

    height:
        440,


    layer:
        "temperature",


    interpolation:
        true,


    isobars:
        true,

    isobarIntervalHpa:
        4,


    windVectors:
        false,

    windVectorSpacingPx:
        42,

    windVectorScale:
        1.3,


    steeringArrows:
        true,

    systems:
        true,


    frontOverlay:
        false,


    landOutline:
        false,


    particleOpacity:
        0.45,


    backgroundAlpha:
        255
});


/* ============================================================================
   BASIC HELPERS
============================================================================ */

function clamp01(
    value
) {

    return U.clamp(
        value,
        0,
        1
    );
}


function finiteOr(
    value,
    fallback
) {

    return Number.isFinite(
        value
    )
        ? value
        : fallback;
}


function rgba(
    r,
    g,
    b,
    a = 255
) {

    return [
        U.clamp(
            Math.round(
                r
            ),
            0,
            255
        ),

        U.clamp(
            Math.round(
                g
            ),
            0,
            255
        ),

        U.clamp(
            Math.round(
                b
            ),
            0,
            255
        ),

        U.clamp(
            Math.round(
                a
            ),
            0,
            255
        )
    ];
}


function mixColour(
    a,
    b,
    t
) {

    t = clamp01(
        t
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
            a[3] === undefined
                ? 255
                : a[3],

            b[3] === undefined
                ? 255
                : b[3],

            t
        )
    );
}


/* ============================================================================
   GENERIC MULTI-STOP COLOUR SCALE

   Stops:

       [
           [value, [r,g,b]],
           [value, [r,g,b]],
           ...
       ]
============================================================================ */

function colourScale(
    value,
    stops
) {

    if (
        value <=
        stops[0][0]
    ) {

        return rgba(
            ...stops[0][1]
        );
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

        return rgba(
            ...last[1]
        );
    }


    for (
        let i = 0;
        i < stops.length - 1;
        i++
    ) {

        const left = (
            stops[i]
        );


        const right = (
            stops[
                i + 1
            ]
        );


        if (
            value >=
            left[0] &&
            value <=
            right[0]
        ) {

            const t = (

                value -
                left[0]

            ) /
            Math.max(
                0.000001,
                right[0] -
                left[0]
            );


            return mixColour(
                rgba(
                    ...left[1]
                ),
                rgba(
                    ...right[1]
                ),
                t
            );
        }
    }


    return rgba(
        0,
        0,
        0
    );
}


/* ============================================================================
   WEATHER COLOUR TABLES
============================================================================ */

const TEMPERATURE_STOPS = [

    [
        -40,
        [
            100,
            35,
            125
        ]
    ],

    [
        -30,
        [
            130,
            65,
            175
        ]
    ],

    [
        -20,
        [
            95,
            110,
            215
        ]
    ],

    [
        -15,
        [
            65,
            150,
            235
        ]
    ],

    [
        -10,
        [
            80,
            205,
            240
        ]
    ],

    [
        -5,
        [
            145,
            235,
            245
        ]
    ],

    [
        0,
        [
            225,
            250,
            250
        ]
    ],

    [
        5,
        [
            160,
            225,
            170
        ]
    ],

    [
        10,
        [
            95,
            195,
            105
        ]
    ],

    [
        15,
        [
            205,
            220,
            75
        ]
    ],

    [
        20,
        [
            245,
            200,
            70
        ]
    ],

    [
        25,
        [
            245,
            145,
            55
        ]
    ],

    [
        30,
        [
            225,
            80,
            45
        ]
    ],

    [
        35,
        [
            190,
            45,
            40
        ]
    ],

    [
        40,
        [
            125,
            25,
            35
        ]
    ],

    [
        45,
        [
            85,
            20,
            50
        ]
    ]
];


const ANOMALY_STOPS = [

    [
        -20,
        [
            70,
            20,
            120
        ]
    ],

    [
        -15,
        [
            70,
            55,
            180
        ]
    ],

    [
        -10,
        [
            55,
            115,
            225
        ]
    ],

    [
        -7,
        [
            65,
            170,
            240
        ]
    ],

    [
        -5,
        [
            100,
            205,
            245
        ]
    ],

    [
        -3,
        [
            150,
            225,
            245
        ]
    ],

    [
        -1,
        [
            215,
            240,
            245
        ]
    ],

    [
        0,
        [
            245,
            245,
            240
        ]
    ],

    [
        1,
        [
            250,
            235,
            205
        ]
    ],

    [
        3,
        [
            250,
            205,
            150
        ]
    ],

    [
        5,
        [
            245,
            155,
            90
        ]
    ],

    [
        7,
        [
            235,
            105,
            65
        ]
    ],

    [
        10,
        [
            205,
            55,
            50
        ]
    ],

    [
        15,
        [
            145,
            25,
            55
        ]
    ],

    [
        20,
        [
            90,
            15,
            65
        ]
    ]
];


const PRESSURE_STOPS = [

    [
        960,
        [
            85,
            70,
            150
        ]
    ],

    [
        975,
        [
            90,
            120,
            190
        ]
    ],

    [
        990,
        [
            100,
            175,
            215
        ]
    ],

    [
        1000,
        [
            150,
            205,
            220
        ]
    ],

    [
        1010,
        [
            215,
            225,
            210
        ]
    ],

    [
        1020,
        [
            230,
            210,
            155
        ]
    ],

    [
        1030,
        [
            225,
            165,
            105
        ]
    ],

    [
        1040,
        [
            200,
            105,
            75
        ]
    ],

    [
        1050,
        [
            160,
            65,
            75
        ]
    ]
];


const SST_STOPS = [

    [
        -2,
        [
            215,
            245,
            250
        ]
    ],

    [
        0,
        [
            160,
            225,
            245
        ]
    ],

    [
        5,
        [
            75,
            175,
            225
        ]
    ],

    [
        10,
        [
            60,
            200,
            165
        ]
    ],

    [
        15,
        [
            115,
            210,
            100
        ]
    ],

    [
        20,
        [
            230,
            215,
            70
        ]
    ],

    [
        25,
        [
            245,
            145,
            55
        ]
    ],

    [
        30,
        [
            205,
            65,
            45
        ]
    ]
];


const WIND_STOPS = [

    [
        0,
        [
            225,
            235,
            235
        ]
    ],

    [
        5,
        [
            145,
            215,
            190
        ]
    ],

    [
        10,
        [
            100,
            195,
            120
        ]
    ],

    [
        15,
        [
            210,
            215,
            85
        ]
    ],

    [
        20,
        [
            240,
            170,
            65
        ]
    ],

    [
        25,
        [
            230,
            100,
            55
        ]
    ],

    [
        35,
        [
            185,
            55,
            75
        ]
    ],

    [
        50,
        [
            105,
            40,
            100
        ]
    ]
];


const SNOW_STOPS = [

    [
        0,
        [
            55,
            70,
            75
        ]
    ],

    [
        0.5,
        [
            200,
            220,
            225
        ]
    ],

    [
        2,
        [
            225,
            235,
            240
        ]
    ],

    [
        5,
        [
            240,
            245,
            250
        ]
    ],

    [
        10,
        [
            210,
            230,
            250
        ]
    ],

    [
        25,
        [
            165,
            205,
            250
        ]
    ],

    [
        50,
        [
            110,
            165,
            235
        ]
    ],

    [
        100,
        [
            95,
            100,
            210
        ]
    ]
];


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


        this.options = {
            ...DEFAULTS,
            ...options
        };


        this.canvas = (
            this._resolveCanvas(
                canvasOrId
            )
        );


        this.context = (
            this.canvas.getContext(
                "2d",
                {
                    alpha:
                        true
                }
            )
        );


        if (
            !this.context
        ) {

            throw new Error(
                "EuropaRenderer could not create a 2D canvas context."
            );
        }


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


        this.showIsobars = (
            this.options.isobars
        );


        this.showWindVectors = (
            this.options.windVectors
        );


        this.showSteeringArrows = (
            this.options.steeringArrows
        );


        this.showSystems = (
            this.options.systems
        );


        this.showFrontOverlay = (
            this.options.frontOverlay
        );


        this.imageData = (
            this.context.createImageData(
                this.width,
                this.height
            )
        );


        this.pixelData = (
            this.imageData.data
        );


        /* ====================================================================
           PRECALCULATED DISPLAY -> PHYSICS GRID LOOKUP

           This removes a large amount of repeated coordinate arithmetic.
           ==================================================================== */

        this.lookupX = (
            new Float32Array(
                this.width
            )
        );


        this.lookupY = (
            new Float32Array(
                this.height
            )
        );


        this.lookupLon = (
            new Float32Array(
                this.width
            )
        );


        this.lookupLat = (
            new Float32Array(
                this.height
            )
        );


        this._buildLookupTables();


        /* ====================================================================
           RENDER STATE
           ==================================================================== */

        this.lastRenderMs = 0;

        this.renderCount = 0;

        this.autoRenderEnabled = false;


        this._unsubscribe = [];


        /* ====================================================================
           MOUSE
           ==================================================================== */

        this.mouse = {

            x:
                0,

            y:
                0,

            lat:
                null,

            lon:
                null,

            inside:
                false,

            sample:
                null
        };


        this._installMouseEvents();


        if (
            this.options.autoRender ===
            true
        ) {

            this.enableAutoRender();
        }


        this.render();
    }


    /* ========================================================================
       CANVAS
       ======================================================================== */

    _resolveCanvas(
        canvasOrId
    ) {

        if (
            canvasOrId instanceof
            HTMLCanvasElement
        ) {

            return canvasOrId;
        }


        if (
            typeof canvasOrId ===
            "string"
        ) {

            const found = (
                document.getElementById(
                    canvasOrId
                )
            );


            if (
                found instanceof
                HTMLCanvasElement
            ) {

                return found;
            }
        }


        /*
         * Create one automatically if no canvas supplied.
         */

        const canvas = (
            document.createElement(
                "canvas"
            )
        );


        canvas.id = (
            "europa-weather-canvas"
        );


        return canvas;
    }


    /* ========================================================================
       LOOKUP TABLES
       ======================================================================== */

    _buildLookupTables() {

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
            x < this.width;
            x++
        ) {

            const t = (

                x /
                Math.max(
                    1,
                    this.width - 1
                )
            );


            this.lookupX[x] = (

                t *
                (
                    nx - 1
                )
            );


            this.lookupLon[x] = U.lerp(

                C.bounds.west,

                C.bounds.east,

                t
            );
        }


        /*
         * Canvas top = north.
         */

        for (
            let y = 0;
            y < this.height;
            y++
        ) {

            const t = (

                y /
                Math.max(
                    1,
                    this.height - 1
                )
            );


            this.lookupY[y] = (

                t *
                (
                    ny - 1
                )
            );


            this.lookupLat[y] = U.lerp(

                C.bounds.north,

                C.bounds.south,

                t
            );
        }
    }


    /* ========================================================================
       LOCAL BILINEAR SAMPLING

       Kept inside renderer rather than repeatedly invoking the full weather
       sampling system.
       ======================================================================== */

    _sampleField(
        field,
        gx,
        gy,
        nx,
        ny
    ) {

        if (
            !field
        ) {

            return 0;
        }


        gx = U.clamp(
            gx,
            0,
            nx - 1
        );


        gy = U.clamp(
            gy,
            0,
            ny - 1
        );


        const x0 = Math.floor(
            gx
        );


        const y0 = Math.floor(
            gy
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
            gx -
            x0
        );


        const ty = (
            gy -
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


        const top = U.lerp(

            field[i00],

            field[i10],

            tx
        );


        const bottom = U.lerp(

            field[i01],

            field[i11],

            tx
        );


        return U.lerp(

            top,

            bottom,

            ty
        );
    }


    /* ========================================================================
       CATEGORICAL NEAREST SAMPLE
       ======================================================================== */

    _sampleNearest(
        field,
        gx,
        gy,
        nx,
        ny
    ) {

        if (
            !field
        ) {

            return 0;
        }


        const x = U.clamp(

            Math.round(
                gx
            ),

            0,

            nx - 1
        );


        const y = U.clamp(

            Math.round(
                gy
            ),

            0,

            ny - 1
        );


        return field[
            y *
            nx +
            x
        ];
    }


    /* ========================================================================
       MAP COORDINATES
       ======================================================================== */

    lonToX(
        lon
    ) {

        return (

            (
                lon -
                C.bounds.west
            ) /

            (
                C.bounds.east -
                C.bounds.west
            ) *

            this.width
        );
    }


    latToY(
        lat
    ) {

        return (

            (
                C.bounds.north -
                lat
            ) /

            (
                C.bounds.north -
                C.bounds.south
            ) *

            this.height
        );
    }


    xToLon(
        x
    ) {

        return U.lerp(

            C.bounds.west,

            C.bounds.east,

            x /
            this.width
        );
    }


    yToLat(
        y
    ) {

        return U.lerp(

            C.bounds.north,

            C.bounds.south,

            y /
            this.height
        );
    }


    /* ========================================================================
       LAYER
       ======================================================================== */

    setLayer(
        layer
    ) {

        const allowed = [

            "temperature",

            "anomaly",

            "pressure",

            "wind",

            "cloud",

            "precipitation",

            "snow",

            "sst",

            "fronts"
        ];


        if (
            !allowed.includes(
                layer
            )
        ) {

            console.warn(
                "Unknown EuropaCraft weather layer:",
                layer
            );


            return false;
        }


        this.layer = (
            layer
        );


        this.render();


        return true;
    }


    getLayer() {

        return (
            this.layer
        );
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


        if (
            !fields ||
            !fields.nx ||
            !fields.ny
        ) {

            return;
        }


        this._renderRaster(
            fields
        );


        this.context.putImageData(

            this.imageData,

            0,

            0
        );


        if (
            this.showFrontOverlay &&
            this.layer !==
            "fronts"
        ) {

            this._drawFrontOverlay(
                fields
            );
        }


        if (
            this.showIsobars
        ) {

            this._drawIsobars(
                fields
            );
        }


        if (
            this.showWindVectors
        ) {

            this._drawWindVectors(
                fields
            );
        }


        if (
            this.showSystems
        ) {

            this._drawSystems();
        }


        if (
            this.showSteeringArrows
        ) {

            this._drawSteeringArrows();
        }


        this.lastRenderMs = (

            performance.now() -
            started
        );


        this.renderCount++;
    }


    /* ========================================================================
       RASTER
       ======================================================================== */

    _renderRaster(
        fields
    ) {

        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        let offset = 0;


        for (
            let y = 0;
            y < this.height;
            y++
        ) {

            const gy = (
                this.lookupY[y]
            );


            for (
                let x = 0;
                x < this.width;
                x++
            ) {

                const gx = (
                    this.lookupX[x]
                );


                const colour = (
                    this._colourForCell(

                        fields,

                        gx,

                        gy,

                        nx,

                        ny
                    )
                );


                this.pixelData[
                    offset
                ] = (
                    colour[0]
                );


                this.pixelData[
                    offset + 1
                ] = (
                    colour[1]
                );


                this.pixelData[
                    offset + 2
                ] = (
                    colour[2]
                );


                this.pixelData[
                    offset + 3
                ] = (
                    colour[3] === undefined
                        ? 255
                        : colour[3]
                );


                offset += 4;
            }
        }
    }


    /* ========================================================================
       LAYER COLOUR
       ======================================================================== */

    _colourForCell(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        switch (
            this.layer
        ) {

            case "temperature":
                return this._temperatureColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );


            case "anomaly":
                return this._anomalyColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );


            case "pressure":
                return this._pressureColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );


            case "wind":
                return this._windColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );


            case "cloud":
                return this._cloudColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );


            case "precipitation":
                return this._precipColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );


            case "snow":
                return this._snowColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );


            case "sst":
                return this._sstColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );


            case "fronts":
                return this._frontColour(
                    fields,
                    gx,
                    gy,
                    nx,
                    ny
                );
        }


        return rgba(
            0,
            0,
            0
        );
    }


    /* ========================================================================
       TEMPERATURE
       ======================================================================== */

    _temperatureColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        const value = (
            this._sampleField(

                fields.temperatureC,

                gx,

                gy,

                nx,

                ny
            )
        );


        return colourScale(

            value,

            TEMPERATURE_STOPS
        );
    }


    /* ========================================================================
       ANOMALY

       Diagnostic only.

       This renderer merely displays atmosphere.anomalyC.
       ======================================================================== */

    _anomalyColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        const value = (
            this._sampleField(

                fields.anomalyC,

                gx,

                gy,

                nx,

                ny
            )
        );


        return colourScale(

            value,

            ANOMALY_STOPS
        );
    }


    /* ========================================================================
       PRESSURE
       ======================================================================== */

    _pressureColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        const value = (
            this._sampleField(

                fields.pressureHpa,

                gx,

                gy,

                nx,

                ny
            )
        );


        return colourScale(

            value,

            PRESSURE_STOPS
        );
    }


    /* ========================================================================
       WIND
       ======================================================================== */

    _windColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        let speed;


        if (
            fields.windSpeed
        ) {

            speed = this._sampleField(

                fields.windSpeed,

                gx,

                gy,

                nx,

                ny
            );
        }

        else {

            const u = (
                this._sampleField(

                    fields.windU,

                    gx,

                    gy,

                    nx,

                    ny
                )
            );


            const v = (
                this._sampleField(

                    fields.windV,

                    gx,

                    gy,

                    nx,

                    ny
                )
            );


            speed = Math.hypot(
                u,
                v
            );
        }


        return colourScale(

            speed,

            WIND_STOPS
        );
    }


    /* ========================================================================
       CLOUD
       ======================================================================== */

    _cloudColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        const cloud = clamp01(

            this._sampleField(

                fields.cloudFraction,

                gx,

                gy,

                nx,

                ny
            )
        );


        const water = U.clamp(

            this._sampleField(

                fields.cloudWater,

                gx,

                gy,

                nx,

                ny
            ),

            0,

            2
        );


        const thickness = clamp01(

            cloud *
            0.75 +

            water *
            0.20
        );


        const base = 25;

        const brightness = U.lerp(

            base,

            245,

            thickness
        );


        return rgba(

            brightness,

            brightness,

            brightness + 4
        );
    }


    /* ========================================================================
       PRECIPITATION
       ======================================================================== */

    _precipColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        const rate = Math.max(

            0,

            this._sampleField(

                fields.precipRateMmHr,

                gx,

                gy,

                nx,

                ny
            )
        );


        if (
            rate <
            0.02
        ) {

            /*
             * Dark neutral background where no precipitation occurs.
             */

            return rgba(
                35,
                42,
                45
            );
        }


        const phase = (
            this._sampleNearest(

                fields.precipPhase,

                gx,

                gy,

                nx,

                ny
            )
        );


        /*
         * Snow
         */

        if (
            phase ===
            global.EuropaPrecipPhase.SNOW
        ) {

            if (
                rate < 0.5
            ) {

                return rgba(
                    200,
                    225,
                    245
                );
            }


            if (
                rate < 2
            ) {

                return rgba(
                    150,
                    205,
                    245
                );
            }


            if (
                rate < 5
            ) {

                return rgba(
                    105,
                    160,
                    235
                );
            }


            return rgba(
                125,
                95,
                220
            );
        }


        /*
         * Sleet
         */

        if (
            phase ===
            global.EuropaPrecipPhase.SLEET
        ) {

            if (
                rate < 1
            ) {

                return rgba(
                    170,
                    190,
                    225
                );
            }


            if (
                rate < 5
            ) {

                return rgba(
                    145,
                    120,
                    215
                );
            }


            return rgba(
                185,
                80,
                190
            );
        }


        /*
         * Rain
         */

        if (
            rate < 0.3
        ) {

            return rgba(
                100,
                190,
                145
            );
        }


        if (
            rate < 1
        ) {

            return rgba(
                55,
                195,
                95
            );
        }


        if (
            rate < 3
        ) {

            return rgba(
                210,
                215,
                65
            );
        }


        if (
            rate < 8
        ) {

            return rgba(
                235,
                145,
                50
            );
        }


        if (
            rate < 20
        ) {

            return rgba(
                215,
                65,
                55
            );
        }


        return rgba(
            150,
            55,
            160
        );
    }


    /* ========================================================================
       SNOW
       ======================================================================== */

    _snowColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        const snow = Math.max(

            0,

            this._sampleField(

                fields.snowDepthCm,

                gx,

                gy,

                nx,

                ny
            )
        );


        return colourScale(

            snow,

            SNOW_STOPS
        );
    }


    /* ========================================================================
       SEA-SURFACE TEMPERATURE
       ======================================================================== */

    _sstColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        const terrain = (
            fields.terrain
        );


        const land = (

            terrain &&
            terrain.land

                ? this._sampleField(

                    terrain.land,

                    gx,

                    gy,

                    nx,

                    ny
                )

                : 0
        );


        if (
            land >
            0.55
        ) {

            return rgba(
                75,
                80,
                70
            );
        }


        const sst = (
            this._sampleField(

                fields.sst,

                gx,

                gy,

                nx,

                ny
            )
        );


        return colourScale(

            sst,

            SST_STOPS
        );
    }


    /* ========================================================================
       FRONTS
       ======================================================================== */

    _frontColour(
        fields,
        gx,
        gy,
        nx,
        ny
    ) {

        const front = clamp01(

            this._sampleField(

                fields.frontStrength,

                gx,

                gy,

                nx,

                ny
            )
        );


        const convergence = (
            this._sampleField(

                fields.convergence,

                gx,

                gy,

                nx,

                ny
            )
        );


        const lift = (
            this._sampleField(

                fields.verticalMotion,

                gx,

                gy,

                nx,

                ny
            )
        );


        if (
            front <
            0.08
        ) {

            const background = (
                25 +
                front *
                80
            );


            return rgba(

                background,

                background,

                background + 3
            );
        }


        const intensity = clamp01(

            front *
            0.75 +

            Math.max(
                0,
                convergence
            ) *
            0.15 +

            Math.min(
                1,
                lift
            ) *
            0.10
        );


        return mixColour(

            rgba(
                45,
                50,
                55
            ),

            rgba(
                245,
                235,
                120
            ),

            intensity
        );
    }


    /* ========================================================================
       FRONT OVERLAY
       ======================================================================== */

    _drawFrontOverlay(
        fields
    ) {

        const context = (
            this.context
        );


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        context.save();


        context.lineWidth = (
            1.25
        );


        context.strokeStyle = (
            "rgba(255,235,120,0.40)"
        );


        context.beginPath();


        const threshold = (
            0.58
        );


        const step = (
            4
        );


        for (
            let y = step;
            y < this.height - step;
            y += step
        ) {

            const gy = (
                this.lookupY[y]
            );


            for (
                let x = step;
                x < this.width - step;
                x += step
            ) {

                const gx = (
                    this.lookupX[x]
                );


                const front = (
                    this._sampleField(

                        fields.frontStrength,

                        gx,

                        gy,

                        nx,

                        ny
                    )
                );


                if (
                    front <
                    threshold
                ) {

                    continue;
                }


                const left = (
                    this._sampleField(

                        fields.frontStrength,

                        this.lookupX[
                            Math.max(
                                0,
                                x - step
                            )
                        ],

                        gy,

                        nx,

                        ny
                    )
                );


                const right = (
                    this._sampleField(

                        fields.frontStrength,

                        this.lookupX[
                            Math.min(
                                this.width - 1,
                                x + step
                            )
                        ],

                        gy,

                        nx,

                        ny
                    )
                );


                const up = (
                    this._sampleField(

                        fields.frontStrength,

                        gx,

                        this.lookupY[
                            Math.max(
                                0,
                                y - step
                            )
                        ],

                        nx,

                        ny
                    )
                );


                const down = (
                    this._sampleField(

                        fields.frontStrength,

                        gx,

                        this.lookupY[
                            Math.min(
                                this.height - 1,
                                y + step
                            )
                        ],

                        nx,

                        ny
                    )
                );


                const dx = (
                    right -
                    left
                );


                const dy = (
                    down -
                    up
                );


                const magnitude = Math.hypot(
                    dx,
                    dy
                );


                if (
                    magnitude <
                    0.03
                ) {

                    continue;
                }


                /*
                 * Draw approximately ALONG front rather than across gradient.
                 */

                const tangentX = (
                    -dy /
                    magnitude
                );


                const tangentY = (
                    dx /
                    magnitude
                );


                const length = (
                    3 +
                    front *
                    6
                );


                context.moveTo(

                    x -
                    tangentX *
                    length,

                    y -
                    tangentY *
                    length
                );


                context.lineTo(

                    x +
                    tangentX *
                    length,

                    y +
                    tangentY *
                    length
                );
            }
        }


        context.stroke();

        context.restore();
    }


    /* ========================================================================
       ISOBARS

       Lightweight marching-squares style approximation.

       This does not perform full meteorological contour analysis. It draws
       smooth visual pressure contours over the directly simulated pressure
       field.
       ======================================================================== */

    _drawIsobars(
        fields
    ) {

        if (
            !fields.pressureHpa
        ) {

            return;
        }


        const context = (
            this.context
        );


        const interval = Math.max(

            1,

            Number(
                this.options.isobarIntervalHpa
            ) ||
            4
        );


        let minimum = Infinity;

        let maximum = -Infinity;


        const pressure = (
            fields.pressureHpa
        );


        for (
            let i = 0;
            i < pressure.length;
            i++
        ) {

            const value = (
                pressure[i]
            );


            if (
                value <
                minimum
            ) {

                minimum = value;
            }


            if (
                value >
                maximum
            ) {

                maximum = value;
            }
        }


        if (
            !Number.isFinite(
                minimum
            ) ||
            !Number.isFinite(
                maximum
            )
        ) {

            return;
        }


        const firstContour = (

            Math.ceil(
                minimum /
                interval
            ) *
            interval
        );


        context.save();


        context.lineWidth = (
            0.8
        );


        context.strokeStyle = (
            "rgba(20,20,25,0.48)"
        );


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        /*
         * Contour directly on physics grid, then scale coordinates to canvas.
         */

        for (
            let contour = firstContour;
            contour <= maximum;
            contour += interval
        ) {

            context.beginPath();


            for (
                let y = 0;
                y < ny - 1;
                y++
            ) {

                for (
                    let x = 0;
                    x < nx - 1;
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


                    const p00 = (
                        pressure[i00]
                    );


                    const p10 = (
                        pressure[i10]
                    );


                    const p01 = (
                        pressure[i01]
                    );


                    const p11 = (
                        pressure[i11]
                    );


                    const minimumCell = Math.min(

                        p00,
                        p10,
                        p01,
                        p11
                    );


                    const maximumCell = Math.max(

                        p00,
                        p10,
                        p01,
                        p11
                    );


                    if (
                        contour <
                        minimumCell ||
                        contour >
                        maximumCell
                    ) {

                        continue;
                    }


                    const intersections = [];


                    this._contourEdge(

                        intersections,

                        contour,

                        p00,

                        p10,

                        x,

                        y,

                        x + 1,

                        y
                    );


                    this._contourEdge(

                        intersections,

                        contour,

                        p10,

                        p11,

                        x + 1,

                        y,

                        x + 1,

                        y + 1
                    );


                    this._contourEdge(

                        intersections,

                        contour,

                        p11,

                        p01,

                        x + 1,

                        y + 1,

                        x,

                        y + 1
                    );


                    this._contourEdge(

                        intersections,

                        contour,

                        p01,

                        p00,

                        x,

                        y + 1,

                        x,

                        y
                    );


                    if (
                        intersections.length >=
                        2
                    ) {

                        const a = (
                            intersections[0]
                        );


                        const b = (
                            intersections[1]
                        );


                        context.moveTo(

                            a.x /
                            (
                                nx - 1
                            ) *
                            this.width,

                            a.y /
                            (
                                ny - 1
                            ) *
                            this.height
                        );


                        context.lineTo(

                            b.x /
                            (
                                nx - 1
                            ) *
                            this.width,

                            b.y /
                            (
                                ny - 1
                            ) *
                            this.height
                        );
                    }


                    if (
                        intersections.length ===
                        4
                    ) {

                        const a = (
                            intersections[2]
                        );


                        const b = (
                            intersections[3]
                        );


                        context.moveTo(

                            a.x /
                            (
                                nx - 1
                            ) *
                            this.width,

                            a.y /
                            (
                                ny - 1
                            ) *
                            this.height
                        );


                        context.lineTo(

                            b.x /
                            (
                                nx - 1
                            ) *
                            this.width,

                            b.y /
                            (
                                ny - 1
                            ) *
                            this.height
                        );
                    }
                }
            }


            context.stroke();
        }


        context.restore();
    }


    _contourEdge(
        intersections,
        contour,
        valueA,
        valueB,
        xA,
        yA,
        xB,
        yB
    ) {

        const crosses = (

            (
                valueA <=
                contour &&
                valueB >=
                contour
            )

            ||

            (
                valueB <=
                contour &&
                valueA >=
                contour
            )
        );


        if (
            !crosses ||
            valueA ===
            valueB
        ) {

            return;
        }


        const t = (

            contour -
            valueA

        ) /
        (
            valueB -
            valueA
        );


        intersections.push({

            x:
                U.lerp(
                    xA,
                    xB,
                    t
                ),

            y:
                U.lerp(
                    yA,
                    yB,
                    t
                )
        });
    }


    /* ========================================================================
       WIND VECTOR OVERLAY
       ======================================================================== */

    _drawWindVectors(
        fields
    ) {

        if (
            !fields.windU ||
            !fields.windV
        ) {

            return;
        }


        const context = (
            this.context
        );


        const spacing = Math.max(

            20,

            Number(
                this.options.windVectorSpacingPx
            ) ||
            42
        );


        const nx = (
            fields.nx
        );


        const ny = (
            fields.ny
        );


        context.save();


        context.strokeStyle = (
            "rgba(20,20,20,0.60)"
        );


        context.fillStyle = (
            "rgba(20,20,20,0.60)"
        );


        context.lineWidth = (
            1
        );


        for (
            let y = spacing / 2;
            y < this.height;
            y += spacing
        ) {

            const gy = (

                y /
                this.height *
                (
                    ny - 1
                )
            );


            for (
                let x = spacing / 2;
                x < this.width;
                x += spacing
            ) {

                const gx = (

                    x /
                    this.width *
                    (
                        nx - 1
                    )
                );


                const u = (
                    this._sampleField(

                        fields.windU,

                        gx,

                        gy,

                        nx,

                        ny
                    )
                );


                const v = (
                    this._sampleField(

                        fields.windV,

                        gx,

                        gy,

                        nx,

                        ny
                    )
                );


                const speed = Math.hypot(
                    u,
                    v
                );


                if (
                    speed <
                    0.5
                ) {

                    continue;
                }


                const angle = Math.atan2(
                    -v,
                    u
                );


                const length = U.clamp(

                    5 +
                    speed *
                    this.options.windVectorScale,

                    5,

                    spacing *
                    0.75
                );


                const dx = (
                    Math.cos(
                        angle
                    ) *
                    length
                );


                const dy = (
                    Math.sin(
                        angle
                    ) *
                    length
                );


                const endX = (
                    x +
                    dx
                );


                const endY = (
                    y +
                    dy
                );


                context.beginPath();

                context.moveTo(
                    x,
                    y
                );

                context.lineTo(
                    endX,
                    endY
                );

                context.stroke();


                const headLength = (
                    4
                );


                const headAngle = (
                    0.55
                );


                context.beginPath();


                context.moveTo(
                    endX,
                    endY
                );


                context.lineTo(

                    endX -
                    Math.cos(
                        angle -
                        headAngle
                    ) *
                    headLength,

                    endY -
                    Math.sin(
                        angle -
                        headAngle
                    ) *
                    headLength
                );


                context.lineTo(

                    endX -
                    Math.cos(
                        angle +
                        headAngle
                    ) *
                    headLength,

                    endY -
                    Math.sin(
                        angle +
                        headAngle
                    ) *
                    headLength
                );


                context.closePath();

                context.fill();
            }
        }


        context.restore();
    }


    /* ========================================================================
       SYNOPTIC SYSTEM MARKERS
       ======================================================================== */

    _drawSystems() {

        const systems = (
            this.weather.getSystems()
        );


        if (
            !systems ||
            systems.length === 0
        ) {

            return;
        }


        const context = (
            this.context
        );


        context.save();


        context.textAlign = (
            "center"
        );


        context.textBaseline = (
            "middle"
        );


        context.font = (
            "bold 18px sans-serif"
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


            const x = (
                this.lonToX(
                    system.lon
                )
            );


            const y = (
                this.latToY(
                    system.lat
                )
            );


            if (
                x < -20 ||
                y < -20 ||
                x >
                this.width + 20 ||
                y >
                this.height + 20
            ) {

                continue;
            }


            const low = (
                system.type ===
                "low"
            );


            context.fillStyle = (
                low
                    ? "rgba(70,90,220,0.90)"
                    : "rgba(210,70,65,0.90)"
            );


            context.fillText(

                low
                    ? "L"
                    : "H",

                x,

                y
            );


            context.font = (
                "11px sans-serif"
            );


            context.fillText(

                Math.round(
                    system.pressureHpa
                ) +
                " hPa",

                x,

                y + 17
            );


            context.font = (
                "bold 18px sans-serif"
            );
        }


        context.restore();
    }


    /* ========================================================================
       STEERING ARROWS
       ======================================================================== */

    _drawSteeringArrows() {

        const arrows = (
            this.weather.getSteeringArrows()
        );


        if (
            !arrows ||
            arrows.length === 0
        ) {

            return;
        }


        const context = (
            this.context
        );


        context.save();


        context.lineWidth = (
            2
        );


        context.strokeStyle = (
            "rgba(255,255,255,0.72)"
        );


        context.fillStyle = (
            "rgba(255,255,255,0.82)"
        );


        for (
            const arrow
            of arrows
        ) {

            const sourceLat = finiteOr(

                arrow.sourceLat,

                arrow.lat1
            );


            const sourceLon = finiteOr(

                arrow.sourceLon,

                arrow.lon1
            );


            const targetLat = finiteOr(

                arrow.targetLat,

                arrow.lat2
            );


            const targetLon = finiteOr(

                arrow.targetLon,

                arrow.lon2
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


            const x1 = (
                this.lonToX(
                    sourceLon
                )
            );


            const y1 = (
                this.latToY(
                    sourceLat
                )
            );


            const x2 = (
                this.lonToX(
                    targetLon
                )
            );


            const y2 = (
                this.latToY(
                    targetLat
                )
            );


            const dx = (
                x2 -
                x1
            );


            const dy = (
                y2 -
                y1
            );


            const angle = Math.atan2(
                dy,
                dx
            );


            context.beginPath();

            context.moveTo(
                x1,
                y1
            );

            context.lineTo(
                x2,
                y2
            );

            context.stroke();


            const head = (
                9
            );


            context.beginPath();

            context.moveTo(
                x2,
                y2
            );


            context.lineTo(

                x2 -
                Math.cos(
                    angle -
                    0.48
                ) *
                head,

                y2 -
                Math.sin(
                    angle -
                    0.48
                ) *
                head
            );


            context.lineTo(

                x2 -
                Math.cos(
                    angle +
                    0.48
                ) *
                head,

                y2 -
                Math.sin(
                    angle +
                    0.48
                ) *
                head
            );


            context.closePath();

            context.fill();
        }


        context.restore();
    }


    /* ========================================================================
       MOUSE SAMPLING
       ======================================================================== */

    _installMouseEvents() {

        this._mouseMoveHandler = event => {

            const rectangle = (
                this.canvas.getBoundingClientRect()
            );


            const x = (

                (
                    event.clientX -
                    rectangle.left
                ) /

                rectangle.width *

                this.width
            );


            const y = (

                (
                    event.clientY -
                    rectangle.top
                ) /

                rectangle.height *

                this.height
            );


            const lon = (
                this.xToLon(
                    x
                )
            );


            const lat = (
                this.yToLat(
                    y
                )
            );


            this.mouse.x = (
                x
            );


            this.mouse.y = (
                y
            );


            this.mouse.lon = (
                lon
            );


            this.mouse.lat = (
                lat
            );


            this.mouse.inside = (
                true
            );


            this.mouse.sample = (
                this.weather.sample(
                    lat,
                    lon
                )
            );


            if (
                typeof this.options.onHover ===
                "function"
            ) {

                this.options.onHover({

                    x,

                    y,

                    lat,

                    lon,

                    sample:
                        this.mouse.sample
                });
            }
        };


        this._mouseLeaveHandler = () => {

            this.mouse.inside = (
                false
            );


            this.mouse.sample = (
                null
            );


            if (
                typeof this.options.onHover ===
                "function"
            ) {

                this.options.onHover(
                    null
                );
            }
        };


        this.canvas.addEventListener(

            "mousemove",

            this._mouseMoveHandler
        );


        this.canvas.addEventListener(

            "mouseleave",

            this._mouseLeaveHandler
        );
    }


    getMouseSample() {

        return (
            this.mouse.sample
        );
    }


    /* ========================================================================
       AUTO RENDER

       The weather controller emits a "frame" event whenever one or more
       physics steps complete during accelerated playback.

       Renderer updates once per displayed frame rather than once per physics
       cell or individual field.
       ======================================================================== */

    enableAutoRender() {

        if (
            this.autoRenderEnabled
        ) {

            return;
        }


        this.autoRenderEnabled = (
            true
        );


        this._unsubscribe.push(

            this.weather.on(

                "frame",

                () => {

                    this.render();
                }
            )
        );


        this._unsubscribe.push(

            this.weather.on(

                "step",

                () => {

                    this.render();
                }
            )
        );


        this._unsubscribe.push(

            this.weather.on(

                "seek",

                () => {

                    this.render();
                }
            )
        );


        this._unsubscribe.push(

            this.weather.on(

                "reset",

                () => {

                    this.render();
                }
            )
        );


        this._unsubscribe.push(

            this.weather.on(

                "forcingchange",

                () => {

                    this.render();
                }
            )
        );


        this._unsubscribe.push(

            this.weather.on(

                "systemchange",

                () => {

                    this.render();
                }
            )
        );
    }


    disableAutoRender() {

        for (
            const unsubscribe
            of this._unsubscribe
        ) {

            try {

                unsubscribe();
            }

            catch (
                error
            ) {

                /*
                 * Ignore cleanup failure.
                 */
            }
        }


        this._unsubscribe.length = 0;


        this.autoRenderEnabled = (
            false
        );
    }


    /* ========================================================================
       TOGGLES
       ======================================================================== */

    setIsobars(
        enabled
    ) {

        this.showIsobars = (
            Boolean(
                enabled
            )
        );


        this.render();
    }


    setWindVectors(
        enabled
    ) {

        this.showWindVectors = (
            Boolean(
                enabled
            )
        );


        this.render();
    }


    setFrontOverlay(
        enabled
    ) {

        this.showFrontOverlay = (
            Boolean(
                enabled
            )
        );


        this.render();
    }


    setSteeringArrows(
        enabled
    ) {

        this.showSteeringArrows = (
            Boolean(
                enabled
            )
        );


        this.render();
    }


    setSystemMarkers(
        enabled
    ) {

        this.showSystems = (
            Boolean(
                enabled
            )
        );


        this.render();
    }


    /* ========================================================================
       RESIZE
       ======================================================================== */

    resize(
        width,
        height
    ) {

        width = Math.max(

            1,

            Math.round(
                width
            )
        );


        height = Math.max(

            1,

            Math.round(
                height
            )
        );


        this.width = (
            width
        );


        this.height = (
            height
        );


        this.canvas.width = (
            width
        );


        this.canvas.height = (
            height
        );


        this.imageData = (
            this.context.createImageData(
                width,
                height
            )
        );


        this.pixelData = (
            this.imageData.data
        );


        this.lookupX = (
            new Float32Array(
                width
            )
        );


        this.lookupY = (
            new Float32Array(
                height
            )
        );


        this.lookupLon = (
            new Float32Array(
                width
            )
        );


        this.lookupLat = (
            new Float32Array(
                height
            )
        );


        this._buildLookupTables();


        this.render();
    }


    /* ========================================================================
       RENDER INFORMATION
       ======================================================================== */

    getInfo() {

        return {

            width:
                this.width,

            height:
                this.height,

            displayCells:
                this.width *
                this.height,

            layer:
                this.layer,

            lastRenderMs:
                this.lastRenderMs,

            renderCount:
                this.renderCount,

            isobars:
                this.showIsobars,

            windVectors:
                this.showWindVectors,

            fronts:
                this.showFrontOverlay,

            steeringArrows:
                this.showSteeringArrows,

            systems:
                this.showSystems
        };
    }


    /* ========================================================================
       DESTROY
       ======================================================================== */

    destroy() {

        this.disableAutoRender();


        if (
            this.canvas &&
            this._mouseMoveHandler
        ) {

            this.canvas.removeEventListener(

                "mousemove",

                this._mouseMoveHandler
            );
        }


        if (
            this.canvas &&
            this._mouseLeaveHandler
        ) {

            this.canvas.removeEventListener(

                "mouseleave",

                this._mouseLeaveHandler
            );
        }


        this.weather = null;

        this.context = null;

        this.imageData = null;

        this.pixelData = null;
    }
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


global.EuropaRendererColourScales = Object.freeze({

    temperature:
        TEMPERATURE_STOPS,

    anomaly:
        ANOMALY_STOPS,

    pressure:
        PRESSURE_STOPS,

    sst:
        SST_STOPS,

    wind:
        WIND_STOPS,

    snow:
        SNOW_STOPS
});

})(window);
