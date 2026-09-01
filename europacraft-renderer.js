/*
 * EuropaCraft Atmospheric Simulation
 * V10 Renderer
 *
 * Responsibilities:
 *
 * - Render the complete European atmospheric field.
 * - Render persistent terrain and coastline.
 * - Render selectable meteorological layers.
 * - Render precipitation by intensity and precipitation phase.
 * - Render wind vectors.
 * - Render pressure systems.
 * - Render steering arrows.
 * - Render injected air-mass source records.
 * - Render weather stations.
 * - Render selected-location crosshair.
 * - Provide map coordinate conversion for UI interaction.
 * - Render compact weather-station history graphs.
 *
 *
 * V10 DISPLAY PRINCIPLE
 * ================================================================
 *
 * The renderer never changes the physics.
 *
 * It reads atmospheric state only.
 *
 * Changing the displayed layer cannot alter the atmosphere.
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;

    const A =
        global.EuropaAtmosphere;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-renderer.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-renderer.js"
        );
    }


    if (!A) {
        throw new Error(
            "EuropaCraft V10: europacraft-atmosphere.js must load before europacraft-renderer.js"
        );
    }


    const TRACER_NAMES =
        A.TRACER_NAMES;


    /*
     * FIXED:
     *
     * The first renderer version used TRACER_COUNT in the air-mass
     * rendering code without defining it.
     */

    const TRACER_COUNT =
        TRACER_NAMES.length;


    /* ================================================================
       LAYERS
    ================================================================ */

    const LAYERS =
        Object.freeze({

            TEMPERATURE:
                "temperature",

            ANOMALY:
                "anomaly",

            PRESSURE:
                "pressure",

            CLOUD:
                "cloud",

            PRECIPITATION:
                "precipitation",

            PRECIPITATION_PHASE:
                "precipitation-phase",

            SST:
                "sst",

            AIR_MASS:
                "air-mass",

            FRONT:
                "front",

            LIFT:
                "lift",

            CONVERGENCE:
                "convergence",

            HUMIDITY:
                "humidity",

            SNOW:
                "snow",

            TERRAIN:
                "terrain"
        });


    const VALID_LAYERS =
        new Set(
            Object.values(
                LAYERS
            )
        );


    /* ================================================================
       AIR-MASS COLOURS
    ================================================================ */

    const AIR_MASS_COLOURS =
        Object.freeze({

            "Atlantic":
                [71, 131, 188],

            "Polar Maritime":
                [89, 170, 214],

            "Arctic Maritime":
                [174, 224, 238],

            "Greenland Ice-Sheet":
                [223, 240, 248],

            "North Sea":
                [82, 151, 171],

            "Baltic Maritime":
                [89, 181, 177],

            "Mediterranean":
                [224, 148, 55],

            "Black Sea":
                [76, 146, 161],

            "Caspian Maritime":
                [116, 156, 154],

            "North African":
                [220, 99, 39],

            "Eurasian Continental":
                [113, 104, 170],

            "British Landmass":
                [105, 159, 96],

            "Iberian Interior":
                [196, 135, 62],

            "West-Central European":
                [126, 160, 76],

            "Central / Eastern European":
                [151, 130, 80],

            "Scandinavian Interior":
                [119, 139, 176],

            "Balkan Modified":
                [187, 116, 77],

            "Anatolian Interior":
                [181, 111, 73]
        });


    /* ================================================================
       BASIC COLOUR UTILITIES
    ================================================================ */

    function rgb(
        r,
        g,
        b,
        a = 255
    ) {

        return [

            U.clamp(
                Math.round(r),
                0,
                255
            ),

            U.clamp(
                Math.round(g),
                0,
                255
            ),

            U.clamp(
                Math.round(b),
                0,
                255
            ),

            U.clamp(
                Math.round(a),
                0,
                255
            )
        ];
    }


    function interpolateColour(
        a,
        b,
        t
    ) {

        const f =
            U.clamp01(
                t
            );


        return rgb(

            U.lerp(
                a[0],
                b[0],
                f
            ),

            U.lerp(
                a[1],
                b[1],
                f
            ),

            U.lerp(
                a[2],
                b[2],
                f
            ),

            U.lerp(
                a[3] ?? 255,
                b[3] ?? 255,
                f
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

            return stops[0][1].slice();
        }


        for (
            let i = 1;
            i < stops.length;
            i++
        ) {

            if (
                value <=
                stops[i][0]
            ) {

                const previous =
                    stops[
                        i - 1
                    ];


                const current =
                    stops[
                        i
                    ];


                const t =
                    (
                        value -
                        previous[0]
                    ) /
                    Math.max(
                        1e-9,
                        current[0] -
                        previous[0]
                    );


                return interpolateColour(
                    previous[1],
                    current[1],
                    t
                );
            }
        }


        return stops[
            stops.length - 1
        ][1].slice();
    }


    function rgbaString(
        colour,
        alphaMultiplier = 1
    ) {

        return (
            "rgba(" +
            colour[0] +
            "," +
            colour[1] +
            "," +
            colour[2] +
            "," +
            U.clamp01(
                (
                    colour[3] ??
                    255
                ) /
                255 *
                alphaMultiplier
            ) +
            ")"
        );
    }


    /* ================================================================
       METEOROLOGICAL COLOUR RAMPS
    ================================================================ */

    const TEMPERATURE_STOPS = [

        [-35, rgb(73, 38, 128)],
        [-25, rgb(79, 81, 174)],
        [-15, rgb(72, 143, 205)],
        [-8, rgb(105, 196, 220)],
        [-3, rgb(180, 226, 229)],
        [0, rgb(230, 244, 242)],
        [5, rgb(184, 220, 163)],
        [10, rgb(123, 194, 105)],
        [15, rgb(226, 215, 94)],
        [20, rgb(242, 176, 71)],
        [25, rgb(236, 119, 56)],
        [30, rgb(211, 68, 50)],
        [35, rgb(159, 42, 67)],
        [42, rgb(100, 28, 62)]
    ];


    const ANOMALY_STOPS = [

        [-15, rgb(55, 55, 155)],
        [-10, rgb(66, 100, 190)],
        [-6, rgb(90, 154, 215)],
        [-3, rgb(150, 205, 229)],
        [-1, rgb(220, 237, 240)],
        [0, rgb(238, 238, 232)],
        [1, rgb(242, 225, 204)],
        [3, rgb(239, 176, 127)],
        [6, rgb(224, 115, 77)],
        [10, rgb(183, 63, 58)],
        [15, rgb(119, 35, 57)]
    ];


    const PRESSURE_STOPS = [

        [960, rgb(93, 62, 143)],
        [975, rgb(77, 103, 174)],
        [990, rgb(67, 152, 190)],
        [1000, rgb(94, 183, 170)],
        [1010, rgb(170, 201, 132)],
        [1020, rgb(222, 202, 101)],
        [1030, rgb(222, 154, 85)],
        [1040, rgb(204, 101, 72)],
        [1050, rgb(156, 65, 71)]
    ];


    const SST_STOPS = [

        [-2, rgb(194, 229, 239)],
        [2, rgb(120, 190, 216)],
        [6, rgb(73, 155, 196)],
        [10, rgb(75, 177, 163)],
        [14, rgb(122, 194, 116)],
        [18, rgb(221, 201, 89)],
        [22, rgb(235, 151, 66)],
        [26, rgb(216, 91, 56)],
        [30, rgb(157, 49, 66)]
    ];


    const LIFT_STOPS = [

        [0, rgb(240, 240, 240, 0)],
        [0.1, rgb(173, 221, 221, 100)],
        [0.4, rgb(87, 185, 180, 160)],
        [0.8, rgb(72, 142, 191, 190)],
        [1.4, rgb(103, 91, 180, 220)],
        [2.2, rgb(158, 62, 151, 235)],
        [3.5, rgb(210, 46, 98, 245)]
    ];


    const SNOW_STOPS = [

        [0, rgb(255, 255, 255, 0)],
        [0.2, rgb(225, 237, 242, 100)],
        [1, rgb(198, 224, 238, 160)],
        [5, rgb(167, 205, 230, 200)],
        [15, rgb(124, 166, 211, 225)],
        [30, rgb(100, 119, 179, 240)],
        [60, rgb(90, 71, 150, 250)]
    ];


    /* ================================================================
       PRECIPITATION COLOURS
    ================================================================ */

    function precipitationAlpha(
        rate
    ) {

        if (
            rate <=
            0.002
        ) {
            return 0;
        }


        return U.clamp(
            45 +
            Math.log1p(
                rate *
                2
            ) *
            72,
            45,
            245
        );
    }


    function precipitationColour(
        phase,
        rate
    ) {

        const alpha =
            precipitationAlpha(
                rate
            );


        switch (
            phase
        ) {

            case A.PRECIPITATION_PHASE.RAIN:

                return rgb(
                    44,
                    161,
                    77,
                    alpha
                );


            case A.PRECIPITATION_PHASE.SLEET:

                return rgb(
                    195,
                    87,
                    180,
                    alpha
                );


            case A.PRECIPITATION_PHASE.WET_SNOW:

                return rgb(
                    103,
                    174,
                    217,
                    alpha
                );


            case A.PRECIPITATION_PHASE.SNOW:

                return rgb(
                    216,
                    239,
                    255,
                    alpha
                );


            default:

                return rgb(
                    0,
                    0,
                    0,
                    0
                );
        }
    }


    function precipitationIntensityColour(
        rate
    ) {

        if (
            rate <=
            0.002
        ) {

            return rgb(
                0,
                0,
                0,
                0
            );
        }


        const colour =
            colourRamp(
                rate,
                [

                    [0.05, rgb(154, 220, 174)],
                    [0.5, rgb(70, 184, 109)],
                    [2.5, rgb(45, 154, 169)],
                    [7.5, rgb(57, 91, 184)],
                    [15, rgb(115, 64, 180)],
                    [25, rgb(185, 53, 148)],
                    [50, rgb(214, 53, 76)],
                    [100, rgb(125, 22, 31)]
                ]
            );


        colour[3] =
            precipitationAlpha(
                rate
            );


        return colour;
    }


    /* ================================================================
       RENDERER
    ================================================================ */

    class Renderer {

        constructor(
            canvas,
            weather,
            options = {}
        ) {

            if (
                !canvas ||
                typeof canvas.getContext !==
                    "function"
            ) {

                throw new Error(
                    "EuropaCraft V10 Renderer requires a canvas element."
                );
            }


            if (!weather) {

                throw new Error(
                    "EuropaCraft V10 Renderer requires the Weather engine."
                );
            }


            this.canvas =
                canvas;


            this.ctx =
                canvas.getContext(
                    "2d",
                    {
                        alpha:
                            false
                    }
                );


            this.weather =
                weather;


            this.terrain =
                weather.terrain;


            this.atmosphere =
                weather.atmosphere;


            this.ocean =
                weather.ocean;


            this.synoptic =
                weather.synoptic;


            this.airMasses =
                weather.airMasses;


            this.layer =
                VALID_LAYERS.has(
                    options.layer
                )
                    ? options.layer
                    : LAYERS.TEMPERATURE;


            /* ========================================================
               OVERLAYS
            ======================================================== */

            this.overlays = {

                wind:
                    options.wind !==
                    false,

                pressureSystems:
                    options.pressureSystems !==
                    false,

                steeringArrows:
                    options.steeringArrows !==
                    false,

                airMassSources:
                    options.airMassSources !==
                    false,

                stations:
                    options.stations !==
                    false,

                selection:
                    options.selection !==
                    false
            };


            this.windLevel =
                options.windLevel ||
                "surface";


            this.windSpacing =
                Math.max(
                    24,
                    Number(
                        options.windSpacing
                    ) ||
                    48
                );


            this.selected =
                null;


            this.devicePixelRatio =
                1;


            this.width =
                0;


            this.height =
                0;


            /* ========================================================
               OFFSCREEN FIELD CANVAS
            ======================================================== */

            this.fieldCanvas =
                document.createElement(
                    "canvas"
                );


            this.fieldCanvas.width =
                this.terrain.nx;


            this.fieldCanvas.height =
                this.terrain.ny;


            this.fieldCtx =
                this.fieldCanvas.getContext(
                    "2d"
                );


            this.fieldImage =
                this.fieldCtx.createImageData(
                    this.terrain.nx,
                    this.terrain.ny
                );


            /* ========================================================
               STATIC TERRAIN CANVAS
            ======================================================== */

            this.terrainCanvas =
                document.createElement(
                    "canvas"
                );


            this.terrainCanvas.width =
                this.terrain.nx;


            this.terrainCanvas.height =
                this.terrain.ny;


            this.terrainCtx =
                this.terrainCanvas.getContext(
                    "2d"
                );


            this.terrainImage =
                this.terrainCtx.createImageData(
                    this.terrain.nx,
                    this.terrain.ny
                );


            this.buildTerrainImage();

            this.resize();
        }


        /* ============================================================
           SIZE
        ============================================================ */

        resize(
            cssWidth = null,
            cssHeight = null
        ) {

            const rectangle =
                this.canvas.getBoundingClientRect();


            const width =
                Math.max(
                    1,
                    Math.round(
                        cssWidth ||
                        rectangle.width ||
                        this.canvas.clientWidth ||
                        900
                    )
                );


            const height =
                Math.max(
                    1,
                    Math.round(
                        cssHeight ||
                        rectangle.height ||
                        this.canvas.clientHeight ||
                        520
                    )
                );


            this.devicePixelRatio =
                U.clamp(
                    global.devicePixelRatio ||
                    1,
                    1,
                    2
                );


            this.width =
                width;


            this.height =
                height;


            const pixelWidth =
                Math.round(
                    width *
                    this.devicePixelRatio
                );


            const pixelHeight =
                Math.round(
                    height *
                    this.devicePixelRatio
                );


            if (
                this.canvas.width !==
                    pixelWidth ||
                this.canvas.height !==
                    pixelHeight
            ) {

                this.canvas.width =
                    pixelWidth;


                this.canvas.height =
                    pixelHeight;
            }


            this.ctx.setTransform(
                this.devicePixelRatio,
                0,
                0,
                this.devicePixelRatio,
                0,
                0
            );


            return {

                width:
                    this.width,

                height:
                    this.height
            };
        }


        /* ============================================================
           COORDINATE CONVERSION
        ============================================================ */

        latLonToCanvas(
            latitude,
            longitude
        ) {

            const bounds =
                this.terrain.bounds ||
                C.bounds;


            const x =
                (
                    longitude -
                    bounds.west
                ) /
                (
                    bounds.east -
                    bounds.west
                ) *
                this.width;


            const y =
                (
                    bounds.north -
                    latitude
                ) /
                (
                    bounds.north -
                    bounds.south
                ) *
                this.height;


            return {

                x,

                y
            };
        }


        canvasToLatLon(
            x,
            y
        ) {

            const bounds =
                this.terrain.bounds ||
                C.bounds;


            const longitude =
                bounds.west +
                U.clamp01(
                    x /
                    this.width
                ) *
                (
                    bounds.east -
                    bounds.west
                );


            const latitude =
                bounds.north -
                U.clamp01(
                    y /
                    this.height
                ) *
                (
                    bounds.north -
                    bounds.south
                );


            return {

                lat:
                    latitude,

                lon:
                    longitude
            };
        }


        eventToLatLon(
            event
        ) {

            const rectangle =
                this.canvas.getBoundingClientRect();


            return this.canvasToLatLon(

                event.clientX -
                    rectangle.left,

                event.clientY -
                    rectangle.top
            );
        }


        /* ============================================================
           SELECTED POINT
        ============================================================ */

        setSelected(
            latitude,
            longitude
        ) {

            const bounds =
                this.terrain.bounds ||
                C.bounds;


            this.selected = {

                lat:
                    U.clamp(
                        latitude,
                        bounds.south,
                        bounds.north
                    ),

                lon:
                    U.clamp(
                        longitude,
                        bounds.west,
                        bounds.east
                    )
            };


            return this.selected;
        }


        clearSelected() {

            this.selected =
                null;
        }


        selectedSample() {

            if (
                !this.selected
            ) {
                return null;
            }


            return this.weather.sample(
                this.selected.lat,
                this.selected.lon
            );
        }


        /* ============================================================
           LAYER CONTROL
        ============================================================ */

        setLayer(
            layer
        ) {

            if (
                !VALID_LAYERS.has(
                    layer
                )
            ) {

                throw new Error(
                    "Unknown EuropaCraft V10 renderer layer: " +
                    layer
                );
            }


            this.layer =
                layer;


            return this.layer;
        }


        setOverlay(
            name,
            enabled
        ) {

            if (
                !(name in this.overlays)
            ) {

                throw new Error(
                    "Unknown EuropaCraft V10 renderer overlay: " +
                    name
                );
            }


            this.overlays[
                name
            ] =
                !!enabled;


            return this.overlays[
                name
            ];
        }


        setWindLevel(
            level
        ) {

            if (
                !this.atmosphere.getLevel(
                    level
                )
            ) {

                throw new Error(
                    "Unknown EuropaCraft wind level: " +
                    level
                );
            }


            this.windLevel =
                String(
                    level
                );


            return this.windLevel;
        }


        /* ============================================================
           STATIC TERRAIN
        ============================================================ */

        buildTerrainImage() {

            const data =
                this.terrainImage.data;


            for (
                let cell = 0;
                cell < this.terrain.n;
                cell++
            ) {

                const offset =
                    cell *
                    4;


                const land =
                    this.terrain.land[
                        cell
                    ];


                const altitude =
                    this.terrain.altitudeM[
                        cell
                    ];


                let colour;


                if (
                    land <
                    0.45
                ) {

                    colour =
                        rgb(
                            38,
                            65,
                            82
                        );
                }
                else {

                    const height =
                        U.clamp01(
                            altitude /
                            2600
                        );


                    colour =
                        interpolateColour(

                            rgb(
                                90,
                                112,
                                78
                            ),

                            rgb(
                                170,
                                165,
                                145
                            ),

                            height
                        );


                    if (
                        altitude >
                        1800
                    ) {

                        colour =
                            interpolateColour(

                                colour,

                                rgb(
                                    225,
                                    224,
                                    218
                                ),

                                U.smoothstep(
                                    1800,
                                    3500,
                                    altitude
                                )
                            );
                    }
                }


                data[
                    offset
                ] =
                    colour[0];


                data[
                    offset + 1
                ] =
                    colour[1];


                data[
                    offset + 2
                ] =
                    colour[2];


                data[
                    offset + 3
                ] =
                    255;
            }


            this.terrainCtx.putImageData(
                this.terrainImage,
                0,
                0
            );
        }


        drawTerrainBase() {

            this.ctx.imageSmoothingEnabled =
                true;


            this.ctx.drawImage(
                this.terrainCanvas,
                0,
                0,
                this.width,
                this.height
            );
        }


        /* ============================================================
           AIR-MASS MIX COLOUR
        ============================================================ */

        airMassColourAtCell(
            level,
            cell
        ) {

            const start =
                cell *
                TRACER_COUNT;


            let r =
                0;

            let g =
                0;

            let b =
                0;

            let total =
                0;


            for (
                let tracer = 0;
                tracer < TRACER_COUNT;
                tracer++
            ) {

                const amount =
                    Math.max(
                        0,
                        level.tracers[
                            start +
                            tracer
                        ]
                    );


                if (
                    amount <=
                    0
                ) {
                    continue;
                }


                const name =
                    TRACER_NAMES[
                        tracer
                    ];


                const colour =
                    AIR_MASS_COLOURS[
                        name
                    ] ||
                    [
                        150,
                        150,
                        150
                    ];


                r +=
                    colour[0] *
                    amount;


                g +=
                    colour[1] *
                    amount;


                b +=
                    colour[2] *
                    amount;


                total +=
                    amount;
            }


            if (
                total <=
                1e-9
            ) {

                return rgb(
                    130,
                    130,
                    130
                );
            }


            return rgb(

                r /
                    total,

                g /
                    total,

                b /
                    total
            );
        }


        /* ============================================================
           FIELD COLOUR
        ============================================================ */

        fieldColourAtCell(
            cell
        ) {

            const a =
                this.atmosphere;


            switch (
                this.layer
            ) {

                /* ----------------------------------------------------
                   TEMPERATURE
                ---------------------------------------------------- */

                case LAYERS.TEMPERATURE:

                    return colourRamp(
                        a.surface.tempC[
                            cell
                        ],
                        TEMPERATURE_STOPS
                    );


                /* ----------------------------------------------------
                   TEMPERATURE ANOMALY
                ---------------------------------------------------- */

                case LAYERS.ANOMALY: {

                    const climatology =
                        a.climatologyAtIndex(
                            cell,
                            this.weather.currentDate
                        );


                    const anomaly =
                        a.surface.tempC[
                            cell
                        ] -
                        climatology;


                    return colourRamp(
                        anomaly,
                        ANOMALY_STOPS
                    );
                }


                /* ----------------------------------------------------
                   PRESSURE
                ---------------------------------------------------- */

                case LAYERS.PRESSURE:

                    return colourRamp(
                        a.pressureHpa[
                            cell
                        ],
                        PRESSURE_STOPS
                    );


                /* ----------------------------------------------------
                   CLOUD
                ---------------------------------------------------- */

                case LAYERS.CLOUD: {

                    const cloud =
                        U.clamp01(

                            a.surface.cloudFraction[
                                cell
                            ] *
                                0.20 +

                            a.level925.cloudFraction[
                                cell
                            ] *
                                0.32 +

                            a.level850.cloudFraction[
                                cell
                            ] *
                                0.32 +

                            a.level700.cloudFraction[
                                cell
                            ] *
                                0.16
                        );


                    const condensate =
                        (
                            a.surface.cloudLiquid[
                                cell
                            ] +
                            a.surface.cloudIce[
                                cell
                            ] +
                            a.level925.cloudLiquid[
                                cell
                            ] +
                            a.level925.cloudIce[
                                cell
                            ] +
                            a.level850.cloudLiquid[
                                cell
                            ] +
                            a.level850.cloudIce[
                                cell
                            ] +
                            a.level700.cloudLiquid[
                                cell
                            ] +
                            a.level700.cloudIce[
                                cell
                            ]
                        );


                    const darkness =
                        U.clamp01(
                            condensate /
                            0.0035
                        );


                    return rgb(

                        U.lerp(
                            245,
                            105,
                            darkness
                        ),

                        U.lerp(
                            246,
                            113,
                            darkness
                        ),

                        U.lerp(
                            248,
                            129,
                            darkness
                        ),

                        cloud *
                            245
                    );
                }


                /* ----------------------------------------------------
                   PRECIPITATION INTENSITY
                ---------------------------------------------------- */

                case LAYERS.PRECIPITATION:

                    return precipitationIntensityColour(
                        a.precipMmHr[
                            cell
                        ]
                    );


                /* ----------------------------------------------------
                   PRECIPITATION TYPE
                ---------------------------------------------------- */

                case LAYERS.PRECIPITATION_PHASE:

                    return precipitationColour(

                        a.precipitationPhase[
                            cell
                        ],

                        a.precipMmHr[
                            cell
                        ]
                    );


                /* ----------------------------------------------------
                   SST
                ---------------------------------------------------- */

                case LAYERS.SST:

                    if (
                        this.terrain.land[
                            cell
                        ] >
                        0.55
                    ) {

                        return rgb(
                            0,
                            0,
                            0,
                            0
                        );
                    }


                    return colourRamp(
                        this.ocean.sst[
                            cell
                        ],
                        SST_STOPS
                    );


                /* ----------------------------------------------------
                   AIR-MASS SOURCE
                ---------------------------------------------------- */

                case LAYERS.AIR_MASS:

                    return this.airMassColourAtCell(
                        a.level850,
                        cell
                    );


                /* ----------------------------------------------------
                   FRONT STRENGTH
                ---------------------------------------------------- */

                case LAYERS.FRONT: {

                    const front =
                        U.clamp01(
                            a.frontStrength[
                                cell
                            ] /
                            C.fronts.maximumFrontStrength
                        );


                    return interpolateColour(

                        rgb(
                            250,
                            250,
                            250,
                            0
                        ),

                        rgb(
                            233,
                            56,
                            118,
                            245
                        ),

                        front
                    );
                }


                /* ----------------------------------------------------
                   VERTICAL LIFT
                ---------------------------------------------------- */

                case LAYERS.LIFT:

                    return colourRamp(
                        a.totalLift[
                            cell
                        ],
                        LIFT_STOPS
                    );


                /* ----------------------------------------------------
                   CONVERGENCE
                ---------------------------------------------------- */

                case LAYERS.CONVERGENCE: {

                    const convergence =
                        a.convergence[
                            cell
                        ];


                    if (
                        convergence >=
                        0
                    ) {

                        const strength =
                            U.clamp01(
                                convergence /
                                (
                                    C.fronts
                                        .convergenceThreshold *
                                    4
                                )
                            );


                        return interpolateColour(

                            rgb(
                                240,
                                240,
                                240
                            ),

                            rgb(
                                198,
                                50,
                                72
                            ),

                            strength
                        );
                    }


                    const strength =
                        U.clamp01(
                            -convergence /
                            (
                                C.fronts
                                    .convergenceThreshold *
                                4
                            )
                        );


                    return interpolateColour(

                        rgb(
                            240,
                            240,
                            240
                        ),

                        rgb(
                            57,
                            97,
                            184
                        ),

                        strength
                    );
                }


                /* ----------------------------------------------------
                   RELATIVE HUMIDITY
                ---------------------------------------------------- */

                case LAYERS.HUMIDITY: {

                    const rh =
                        U.clamp01(
                            a.level925.relativeHumidity[
                                cell
                            ]
                        );


                    return interpolateColour(

                        rgb(
                            171,
                            133,
                            94
                        ),

                        rgb(
                            72,
                            157,
                            191
                        ),

                        U.smoothstep(
                            0.30,
                            1,
                            rh
                        )
                    );
                }


                /* ----------------------------------------------------
                   SNOW DEPTH
                ---------------------------------------------------- */

                case LAYERS.SNOW:

                    return colourRamp(
                        a.snowDepthCm[
                            cell
                        ],
                        SNOW_STOPS
                    );


                /* ----------------------------------------------------
                   TERRAIN
                ---------------------------------------------------- */

                case LAYERS.TERRAIN:

                    return rgb(
                        0,
                        0,
                        0,
                        0
                    );


                default:

                    return rgb(
                        0,
                        0,
                        0,
                        0
                    );
            }
        }


        /* ============================================================
           BUILD FIELD IMAGE
        ============================================================ */

        buildFieldImage() {

            const data =
                this.fieldImage.data;


            for (
                let cell = 0;
                cell < this.terrain.n;
                cell++
            ) {

                const colour =
                    this.fieldColourAtCell(
                        cell
                    );


                const offset =
                    cell *
                    4;


                data[
                    offset
                ] =
                    colour[0];


                data[
                    offset + 1
                ] =
                    colour[1];


                data[
                    offset + 2
                ] =
                    colour[2];


                data[
                    offset + 3
                ] =
                    colour[3];
            }


            this.fieldCtx.putImageData(
                this.fieldImage,
                0,
                0
            );
        }


        drawField() {

            if (
                this.layer ===
                LAYERS.TERRAIN
            ) {
                return;
            }


            this.buildFieldImage();


            this.ctx.imageSmoothingEnabled =
                true;


            this.ctx.drawImage(
                this.fieldCanvas,
                0,
                0,
                this.width,
                this.height
            );
        }


        /* ============================================================
           COASTLINE
        ============================================================ */

        drawCoastline() {

            const ctx =
                this.ctx;


            ctx.save();


            ctx.strokeStyle =
                "rgba(230,235,232,0.42)";


            ctx.lineWidth =
                0.75;


            ctx.beginPath();


            for (
                let y = 0;
                y < this.terrain.ny - 1;
                y++
            ) {

                for (
                    let x = 0;
                    x < this.terrain.nx - 1;
                    x++
                ) {

                    const cell =
                        y *
                        this.terrain.nx +
                        x;


                    const current =
                        this.terrain.land[
                            cell
                        ] >=
                        0.5;


                    const right =
                        this.terrain.land[
                            cell + 1
                        ] >=
                        0.5;


                    const down =
                        this.terrain.land[
                            cell +
                            this.terrain.nx
                        ] >=
                        0.5;


                    const xCanvas =
                        x /
                        (
                            this.terrain.nx -
                            1
                        ) *
                        this.width;


                    const yCanvas =
                        y /
                        (
                            this.terrain.ny -
                            1
                        ) *
                        this.height;


                    const nextX =
                        (
                            x + 1
                        ) /
                        (
                            this.terrain.nx -
                            1
                        ) *
                        this.width;


                    const nextY =
                        (
                            y + 1
                        ) /
                        (
                            this.terrain.ny -
                            1
                        ) *
                        this.height;


                    if (
                        current !==
                        right
                    ) {

                        ctx.moveTo(
                            nextX,
                            yCanvas
                        );


                        ctx.lineTo(
                            nextX,
                            nextY
                        );
                    }


                    if (
                        current !==
                        down
                    ) {

                        ctx.moveTo(
                            xCanvas,
                            nextY
                        );


                        ctx.lineTo(
                            nextX,
                            nextY
                        );
                    }
                }
            }


            ctx.stroke();


            ctx.restore();
        }


        /* ============================================================
           PRESSURE CONTOURS
        ============================================================ */

        drawPressureContours() {

            if (
                this.layer !==
                LAYERS.PRESSURE
            ) {
                return;
            }


            const ctx =
                this.ctx;


            const pressure =
                this.atmosphere.pressureHpa;


            ctx.save();


            ctx.strokeStyle =
                "rgba(255,255,255,0.42)";


            ctx.lineWidth =
                0.8;


            const levels = [];


            for (
                let pressureLevel = 960;
                pressureLevel <= 1050;
                pressureLevel += 4
            ) {

                levels.push(
                    pressureLevel
                );
            }


            for (
                const contour of levels
            ) {

                ctx.beginPath();


                for (
                    let y = 0;
                    y < this.terrain.ny - 1;
                    y++
                ) {

                    for (
                        let x = 0;
                        x < this.terrain.nx - 1;
                        x++
                    ) {

                        const cell =
                            y *
                            this.terrain.nx +
                            x;


                        const p00 =
                            pressure[
                                cell
                            ];


                        const p10 =
                            pressure[
                                cell + 1
                            ];


                        const p01 =
                            pressure[
                                cell +
                                this.terrain.nx
                            ];


                        const crossesHorizontal =
                            (
                                p00 -
                                contour
                            ) *
                            (
                                p10 -
                                contour
                            ) <
                            0;


                        const crossesVertical =
                            (
                                p00 -
                                contour
                            ) *
                            (
                                p01 -
                                contour
                            ) <
                            0;


                        const px =
                            x /
                            (
                                this.terrain.nx -
                                1
                            ) *
                            this.width;


                        const py =
                            y /
                            (
                                this.terrain.ny -
                                1
                            ) *
                            this.height;


                        const cellWidth =
                            this.width /
                            (
                                this.terrain.nx -
                                1
                            );


                        const cellHeight =
                            this.height /
                            (
                                this.terrain.ny -
                                1
                            );


                        if (
                            crossesHorizontal
                        ) {

                            const t =
                                (
                                    contour -
                                    p00
                                ) /
                                (
                                    p10 -
                                    p00
                                );


                            const cx =
                                px +
                                cellWidth *
                                t;


                            ctx.moveTo(
                                cx,
                                py - 1.5
                            );


                            ctx.lineTo(
                                cx,
                                py + 1.5
                            );
                        }


                        if (
                            crossesVertical
                        ) {

                            const t =
                                (
                                    contour -
                                    p00
                                ) /
                                (
                                    p01 -
                                    p00
                                );


                            const cy =
                                py +
                                cellHeight *
                                t;


                            ctx.moveTo(
                                px - 1.5,
                                cy
                            );


                            ctx.lineTo(
                                px + 1.5,
                                cy
                            );
                        }
                    }
                }


                ctx.stroke();
            }


            ctx.restore();
        }


        /* ============================================================
           WIND VECTORS
        ============================================================ */

        drawArrowGlyph(
            x,
            y,
            u,
            v,
            scale = 1
        ) {

            const speed =
                Math.hypot(
                    u,
                    v
                );


            if (
                speed <
                0.4
            ) {
                return;
            }


            const maximumLength =
                this.windSpacing *
                0.72;


            const length =
                U.clamp(
                    8 +
                    speed *
                    0.75,
                    8,
                    maximumLength
                ) *
                scale;


            const ux =
                u /
                speed;


            /*
             * Canvas Y increases southward.
             * Atmospheric positive V is northward.
             */

            const uy =
                -v /
                speed;


            const endX =
                x +
                ux *
                length;


            const endY =
                y +
                uy *
                length;


            const head =
                Math.min(
                    6,
                    length *
                    0.35
                );


            const leftX =
                endX -
                ux *
                head -
                uy *
                head *
                0.55;


            const leftY =
                endY -
                uy *
                head +
                ux *
                head *
                0.55;


            const rightX =
                endX -
                ux *
                head +
                uy *
                head *
                0.55;


            const rightY =
                endY -
                uy *
                head -
                ux *
                head *
                0.55;


            const ctx =
                this.ctx;


            ctx.beginPath();


            ctx.moveTo(
                x,
                y
            );


            ctx.lineTo(
                endX,
                endY
            );


            ctx.moveTo(
                leftX,
                leftY
            );


            ctx.lineTo(
                endX,
                endY
            );


            ctx.lineTo(
                rightX,
                rightY
            );


            ctx.stroke();
        }


        drawWind() {

            if (
                !this.overlays.wind
            ) {
                return;
            }


            const level =
                this.atmosphere.getLevel(
                    this.windLevel
                ) ||
                this.atmosphere.surface;


            const ctx =
                this.ctx;


            ctx.save();


            ctx.strokeStyle =
                "rgba(255,255,255,0.72)";


            ctx.lineWidth =
                1.15;


            ctx.lineCap =
                "round";


            const columns =
                Math.max(
                    1,
                    Math.floor(
                        this.width /
                        this.windSpacing
                    )
                );


            const rows =
                Math.max(
                    1,
                    Math.floor(
                        this.height /
                        this.windSpacing
                    )
                );


            for (
                let row = 0;
                row <= rows;
                row++
            ) {

                for (
                    let column = 0;
                    column <= columns;
                    column++
                ) {

                    const x =
                        (
                            column +
                            0.5
                        ) /
                        (
                            columns +
                            1
                        ) *
                        this.width;


                    const y =
                        (
                            row +
                            0.5
                        ) /
                        (
                            rows +
                            1
                        ) *
                        this.height;


                    const location =
                        this.canvasToLatLon(
                            x,
                            y
                        );


                    const u =
                        this.terrain.sampleArray(
                            level.u,
                            location.lat,
                            location.lon
                        );


                    const v =
                        this.terrain.sampleArray(
                            level.v,
                            location.lat,
                            location.lon
                        );


                    this.drawArrowGlyph(
                        x,
                        y,
                        u,
                        v
                    );
                }
            }


            ctx.restore();
        }


        /* ============================================================
           SYNOPTIC SYSTEMS
        ============================================================ */

        drawPressureSystems() {

            if (
                !this.overlays.pressureSystems
            ) {
                return;
            }


            const ctx =
                this.ctx;


            ctx.save();


            ctx.textAlign =
                "center";


            ctx.textBaseline =
                "middle";


            for (
                const system of this.synoptic.systems
            ) {

                if (
                    !system.enabled
                ) {
                    continue;
                }


                const position =
                    this.latLonToCanvas(
                        system.lat,
                        system.lon
                    );


                if (
                    position.x <
                        -50 ||
                    position.x >
                        this.width +
                        50 ||
                    position.y <
                        -50 ||
                    position.y >
                        this.height +
                        50
                ) {
                    continue;
                }


                const life =
                    system.lifecycleFactor();


                if (
                    life <=
                    0.02
                ) {
                    continue;
                }


                const isLow =
                    system.kind ===
                    "low";


                ctx.font =
                    "700 24px system-ui, sans-serif";


                ctx.fillStyle =
                    isLow
                        ? "rgba(235,78,88,0.92)"
                        : "rgba(79,132,226,0.92)";


                ctx.strokeStyle =
                    "rgba(15,20,25,0.72)";


                ctx.lineWidth =
                    3;


                const symbol =
                    isLow
                        ? "L"
                        : "H";


                ctx.strokeText(
                    symbol,
                    position.x,
                    position.y
                );


                ctx.fillText(
                    symbol,
                    position.x,
                    position.y
                );


                ctx.font =
                    "600 11px system-ui, sans-serif";


                const pressureText =
                    Math.round(
                        system.centralPressureHpa
                    ) +
                    " hPa";


                ctx.strokeText(
                    pressureText,
                    position.x,
                    position.y +
                        19
                );


                ctx.fillText(
                    pressureText,
                    position.x,
                    position.y +
                        19
                );
            }


            ctx.restore();
        }


        /* ============================================================
           STEERING ARROWS
        ============================================================ */

        drawSteeringArrows() {

            if (
                !this.overlays.steeringArrows
            ) {
                return;
            }


            const ctx =
                this.ctx;


            ctx.save();


            ctx.strokeStyle =
                "rgba(255,205,74,0.92)";


            ctx.fillStyle =
                "rgba(255,205,74,0.92)";


            ctx.lineWidth =
                2.5;


            ctx.lineCap =
                "round";


            for (
                const arrow of this.synoptic.arrows
            ) {

                if (
                    !arrow.enabled
                ) {
                    continue;
                }


                const start =
                    this.latLonToCanvas(
                        arrow.startLat,
                        arrow.startLon
                    );


                const end =
                    this.latLonToCanvas(
                        arrow.endLat,
                        arrow.endLon
                    );


                const dx =
                    end.x -
                    start.x;


                const dy =
                    end.y -
                    start.y;


                const length =
                    Math.hypot(
                        dx,
                        dy
                    );


                if (
                    length <
                    2
                ) {
                    continue;
                }


                const ux =
                    dx /
                    length;


                const uy =
                    dy /
                    length;


                const head =
                    Math.min(
                        12,
                        length *
                        0.25
                    );


                ctx.beginPath();


                ctx.moveTo(
                    start.x,
                    start.y
                );


                ctx.lineTo(
                    end.x,
                    end.y
                );


                ctx.stroke();


                ctx.beginPath();


                ctx.moveTo(
                    end.x,
                    end.y
                );


                ctx.lineTo(
                    end.x -
                        ux *
                        head -
                        uy *
                        head *
                        0.55,
                    end.y -
                        uy *
                        head +
                        ux *
                        head *
                        0.55
                );


                ctx.lineTo(
                    end.x -
                        ux *
                        head +
                        uy *
                        head *
                        0.55,
                    end.y -
                        uy *
                        head -
                        ux *
                        head *
                        0.55
                );


                ctx.closePath();


                ctx.fill();
            }


            ctx.restore();
        }


        /* ============================================================
           AIR-MASS SOURCE RECORDS
        ============================================================ */

        drawAirMassSources() {

            if (
                !this.overlays.airMassSources
            ) {
                return;
            }


            const ctx =
                this.ctx;


            ctx.save();


            ctx.textAlign =
                "center";


            ctx.textBaseline =
                "middle";


            for (
                const mass of this.airMasses.masses
            ) {

                if (
                    !mass.enabled
                ) {
                    continue;
                }


                const center =
                    this.latLonToCanvas(
                        mass.lat,
                        mass.lon
                    );


                const edgeLon =
                    mass.lon +
                    mass.radiusKm /
                    U.kmPerDegreeLongitude(
                        mass.lat
                    );


                const edge =
                    this.latLonToCanvas(
                        mass.lat,
                        edgeLon
                    );


                const radiusPixels =
                    Math.abs(
                        edge.x -
                        center.x
                    );


                const colour =
                    AIR_MASS_COLOURS[
                        mass.sourceType
                    ] ||
                    [
                        220,
                        220,
                        220
                    ];


                ctx.strokeStyle =
                    rgbaString(
                        [
                            colour[0],
                            colour[1],
                            colour[2],
                            210
                        ]
                    );


                ctx.fillStyle =
                    rgbaString(
                        [
                            colour[0],
                            colour[1],
                            colour[2],
                            28
                        ]
                    );


                ctx.lineWidth =
                    1.5;


                ctx.beginPath();


                ctx.arc(
                    center.x,
                    center.y,
                    radiusPixels,
                    0,
                    Math.PI *
                        2
                );


                ctx.fill();

                ctx.stroke();


                ctx.fillStyle =
                    rgbaString(
                        [
                            colour[0],
                            colour[1],
                            colour[2],
                            245
                        ]
                    );


                ctx.beginPath();


                ctx.arc(
                    center.x,
                    center.y,
                    5,
                    0,
                    Math.PI *
                        2
                );


                ctx.fill();


                ctx.font =
                    "600 10px system-ui, sans-serif";


                ctx.fillStyle =
                    "rgba(255,255,255,0.92)";


                ctx.strokeStyle =
                    "rgba(0,0,0,0.78)";


                ctx.lineWidth =
                    3;


                ctx.strokeText(
                    mass.sourceType,
                    center.x,
                    center.y -
                        13
                );


                ctx.fillText(
                    mass.sourceType,
                    center.x,
                    center.y -
                        13
                );
            }


            ctx.restore();
        }


        /* ============================================================
           WEATHER STATIONS
        ============================================================ */

        drawStations() {

            if (
                !this.overlays.stations
            ) {
                return;
            }


            const ctx =
                this.ctx;


            ctx.save();


            for (
                const station of
                    this.weather.history.stations.values()
            ) {

                const position =
                    this.latLonToCanvas(
                        station.lat,
                        station.lon
                    );


                ctx.fillStyle =
                    "rgba(255,255,255,0.96)";


                ctx.strokeStyle =
                    "rgba(20,24,29,0.90)";


                ctx.lineWidth =
                    2;


                ctx.beginPath();


                ctx.arc(
                    position.x,
                    position.y,
                    5,
                    0,
                    Math.PI *
                        2
                );


                ctx.fill();

                ctx.stroke();


                ctx.font =
                    "600 10px system-ui, sans-serif";


                ctx.fillStyle =
                    "rgba(255,255,255,0.92)";


                ctx.strokeStyle =
                    "rgba(0,0,0,0.82)";


                ctx.lineWidth =
                    3;


                ctx.textAlign =
                    "left";


                ctx.strokeText(
                    station.name,
                    position.x +
                        8,
                    position.y -
                        7
                );


                ctx.fillText(
                    station.name,
                    position.x +
                        8,
                    position.y -
                        7
                );
            }


            ctx.restore();
        }


        /* ============================================================
           SELECTED LOCATION
        ============================================================ */

        drawSelection() {

            if (
                !this.overlays.selection ||
                !this.selected
            ) {
                return;
            }


            const position =
                this.latLonToCanvas(
                    this.selected.lat,
                    this.selected.lon
                );


            const ctx =
                this.ctx;


            ctx.save();


            ctx.strokeStyle =
                "rgba(255,255,255,0.96)";


            ctx.lineWidth =
                1.5;


            ctx.beginPath();


            ctx.arc(
                position.x,
                position.y,
                8,
                0,
                Math.PI *
                    2
            );


            ctx.moveTo(
                position.x -
                    13,
                position.y
            );


            ctx.lineTo(
                position.x +
                    13,
                position.y
            );


            ctx.moveTo(
                position.x,
                position.y -
                    13
            );


            ctx.lineTo(
                position.x,
                position.y +
                    13
            );


            ctx.stroke();


            ctx.restore();
        }


        /* ============================================================
           STATUS BADGE
        ============================================================ */

        drawStatusBadge() {

            const ctx =
                this.ctx;


            const dateText =
                this.weather.currentDate
                    .toISOString()
                    .replace(
                        "T",
                        " "
                    )
                    .slice(
                        0,
                        16
                    ) +
                " UTC";


            const label =
                C.engineName +
                "  |  " +
                dateText;


            ctx.save();


            ctx.font =
                "600 11px system-ui, sans-serif";


            const width =
                ctx.measureText(
                    label
                ).width +
                16;


            ctx.fillStyle =
                "rgba(10,15,20,0.72)";


            ctx.fillRect(
                8,
                8,
                width,
                25
            );


            ctx.fillStyle =
                "rgba(245,248,250,0.94)";


            ctx.textBaseline =
                "middle";


            ctx.fillText(
                label,
                16,
                20.5
            );


            ctx.restore();
        }


        /* ============================================================
           COMPLETE MAP RENDER
        ============================================================ */

        render() {

            this.resize();


            const ctx =
                this.ctx;


            ctx.save();


            ctx.clearRect(
                0,
                0,
                this.width,
                this.height
            );


            ctx.fillStyle =
                "rgb(31,49,61)";


            ctx.fillRect(
                0,
                0,
                this.width,
                this.height
            );


            this.drawTerrainBase();


            if (
                this.layer !==
                LAYERS.TERRAIN
            ) {

                ctx.globalAlpha =
                    (
                        this.layer ===
                            LAYERS.CLOUD ||

                        this.layer ===
                            LAYERS.PRECIPITATION ||

                        this.layer ===
                            LAYERS.PRECIPITATION_PHASE ||

                        this.layer ===
                            LAYERS.FRONT ||

                        this.layer ===
                            LAYERS.LIFT ||

                        this.layer ===
                            LAYERS.SNOW
                    )
                        ? 0.95
                        : 0.88;


                this.drawField();


                ctx.globalAlpha =
                    1;
            }


            this.drawCoastline();

            this.drawPressureContours();

            this.drawAirMassSources();

            this.drawWind();

            this.drawPressureSystems();

            this.drawSteeringArrows();

            this.drawStations();

            this.drawSelection();

            this.drawStatusBadge();


            ctx.restore();
        }


        /* ============================================================
           POINT PICK
        ============================================================ */

        pick(
            x,
            y
        ) {

            const location =
                this.canvasToLatLon(
                    x,
                    y
                );


            this.setSelected(
                location.lat,
                location.lon
            );


            return {

                location,


                weather:
                    this.weather.sample(
                        location.lat,
                        location.lon
                    ),


                precipitation:
                    this.weather.precipitationDiagnosisAt(
                        location.lat,
                        location.lon
                    ),


                terrain:
                    this.weather.terrainAt(
                        location.lat,
                        location.lon
                    ),


                ocean:
                    this.weather.oceanAt(
                        location.lat,
                        location.lon
                    )
            };
        }


        /* ============================================================
           WEATHER STATION GRAPH
        ============================================================ */

        renderStationChart(
            canvas,
            stationId,
            options = {}
        ) {

            if (
                !canvas ||
                typeof canvas.getContext !==
                    "function"
            ) {
                return false;
            }


            const station =
                this.weather.getStation(
                    stationId
                );


            if (!station) {
                return false;
            }


            const field =
                options.field ||
                "tempC";


            const lastHours =
                Number.isFinite(
                    Number(
                        options.lastHours
                    )
                )
                    ? Number(
                        options.lastHours
                    )
                    : 48;


            const samples =
                station.series({

                    lastHours
                });


            const ctx =
                canvas.getContext(
                    "2d"
                );


            const rect =
                canvas.getBoundingClientRect();


            const width =
                Math.max(
                    1,
                    Math.round(
                        rect.width ||
                        canvas.clientWidth ||
                        500
                    )
                );


            const height =
                Math.max(
                    1,
                    Math.round(
                        rect.height ||
                        canvas.clientHeight ||
                        180
                    )
                );


            const dpr =
                U.clamp(
                    global.devicePixelRatio ||
                    1,
                    1,
                    2
                );


            canvas.width =
                Math.round(
                    width *
                    dpr
                );


            canvas.height =
                Math.round(
                    height *
                    dpr
                );


            ctx.setTransform(
                dpr,
                0,
                0,
                dpr,
                0,
                0
            );


            ctx.fillStyle =
                "rgb(21,27,33)";


            ctx.fillRect(
                0,
                0,
                width,
                height
            );


            if (
                samples.length <
                2
            ) {

                ctx.fillStyle =
                    "rgba(220,225,230,0.75)";


                ctx.font =
                    "12px system-ui, sans-serif";


                ctx.fillText(
                    "Not enough station history yet.",
                    14,
                    24
                );


                return true;
            }


            let minimum =
                Infinity;


            let maximum =
                -Infinity;


            const values =
                new Float32Array(
                    samples.length
                );


            /*
             * Avoid spreading very large station histories through
             * Math.min(...values) / Math.max(...values).
             */

            for (
                let i = 0;
                i < samples.length;
                i++
            ) {

                const value =
                    Number.isFinite(
                        Number(
                            samples[i][field]
                        )
                    )
                        ? Number(
                            samples[i][field]
                        )
                        : 0;


                values[i] =
                    value;


                minimum =
                    Math.min(
                        minimum,
                        value
                    );


                maximum =
                    Math.max(
                        maximum,
                        value
                    );
            }


            if (
                Math.abs(
                    maximum -
                    minimum
                ) <
                0.001
            ) {

                minimum -=
                    1;


                maximum +=
                    1;
            }


            const padding = {

                left:
                    48,

                right:
                    12,

                top:
                    18,

                bottom:
                    30
            };


            const plotWidth =
                width -
                padding.left -
                padding.right;


            const plotHeight =
                height -
                padding.top -
                padding.bottom;


            /* --------------------------------------------------------
               GRID
            -------------------------------------------------------- */

            ctx.strokeStyle =
                "rgba(255,255,255,0.12)";


            ctx.lineWidth =
                1;


            ctx.fillStyle =
                "rgba(225,230,235,0.70)";


            ctx.font =
                "10px system-ui, sans-serif";


            for (
                let line = 0;
                line <= 4;
                line++
            ) {

                const y =
                    padding.top +
                    plotHeight *
                    line /
                    4;


                ctx.beginPath();


                ctx.moveTo(
                    padding.left,
                    y
                );


                ctx.lineTo(
                    width -
                    padding.right,
                    y
                );


                ctx.stroke();


                const value =
                    U.lerp(
                        maximum,
                        minimum,
                        line /
                        4
                    );


                ctx.fillText(
                    value.toFixed(
                        field ===
                            "pressureHpa"
                            ? 0
                            : 1
                    ),
                    5,
                    y +
                        3
                );
            }


            /* --------------------------------------------------------
               DATA LINE
            -------------------------------------------------------- */

            ctx.strokeStyle =
                "rgba(236,240,244,0.94)";


            ctx.lineWidth =
                1.8;


            ctx.beginPath();


            for (
                let i = 0;
                i < samples.length;
                i++
            ) {

                const x =
                    padding.left +
                    plotWidth *
                    i /
                    (
                        samples.length -
                        1
                    );


                const value =
                    values[
                        i
                    ];


                const y =
                    padding.top +
                    plotHeight *
                    (
                        1 -
                        (
                            value -
                            minimum
                        ) /
                        (
                            maximum -
                            minimum
                        )
                    );


                if (
                    i === 0
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


            /* --------------------------------------------------------
               TIME LABELS
            -------------------------------------------------------- */

            const first =
                samples[
                    0
                ];


            const last =
                samples[
                    samples.length -
                    1
                ];


            ctx.fillStyle =
                "rgba(225,230,235,0.70)";


            ctx.textAlign =
                "left";


            ctx.fillText(
                first.date
                    .toISOString()
                    .slice(
                        5,
                        16
                    )
                    .replace(
                        "T",
                        " "
                    ),
                padding.left,
                height -
                    9
            );


            ctx.textAlign =
                "right";


            ctx.fillText(
                last.date
                    .toISOString()
                    .slice(
                        5,
                        16
                    )
                    .replace(
                        "T",
                        " "
                    ),
                width -
                    padding.right,
                height -
                    9
            );


            /* --------------------------------------------------------
               TITLE
            -------------------------------------------------------- */

            ctx.textAlign =
                "center";


            ctx.fillStyle =
                "rgba(245,247,250,0.94)";


            ctx.font =
                "600 11px system-ui, sans-serif";


            ctx.fillText(
                station.name +
                " — " +
                field,
                width /
                    2,
                12
            );


            return true;
        }


        /* ============================================================
           LEGEND INFORMATION
        ============================================================ */

        layerDescription() {

            switch (
                this.layer
            ) {

                case LAYERS.TEMPERATURE:

                    return {

                        title:
                            "Surface Temperature",

                        units:
                            "°C"
                    };


                case LAYERS.ANOMALY:

                    return {

                        title:
                            "Temperature Anomaly",

                        units:
                            "°C"
                    };


                case LAYERS.PRESSURE:

                    return {

                        title:
                            "Surface Pressure",

                        units:
                            "hPa"
                    };


                case LAYERS.CLOUD:

                    return {

                        title:
                            "Cloud",

                        units:
                            "fraction / condensate"
                    };


                case LAYERS.PRECIPITATION:

                    return {

                        title:
                            "Precipitation Intensity",

                        units:
                            "mm/h"
                    };


                case LAYERS.PRECIPITATION_PHASE:

                    return {

                        title:
                            "Precipitation Phase",

                        units:
                            "rain / sleet / wet snow / snow"
                    };


                case LAYERS.SST:

                    return {

                        title:
                            "Sea-Surface Temperature",

                        units:
                            "°C"
                    };


                case LAYERS.AIR_MASS:

                    return {

                        title:
                            "850 hPa Air-Mass Identity",

                        units:
                            "source tracer mixture"
                    };


                case LAYERS.FRONT:

                    return {

                        title:
                            "Front Strength",

                        units:
                            "diagnostic"
                    };


                case LAYERS.LIFT:

                    return {

                        title:
                            "Total Vertical Forcing",

                        units:
                            "diagnostic"
                    };


                case LAYERS.CONVERGENCE:

                    return {

                        title:
                            "925 hPa Convergence",

                        units:
                            "diagnostic"
                    };


                case LAYERS.HUMIDITY:

                    return {

                        title:
                            "925 hPa Relative Humidity",

                        units:
                            "%"
                    };


                case LAYERS.SNOW:

                    return {

                        title:
                            "Snow Depth",

                        units:
                            "cm"
                    };


                case LAYERS.TERRAIN:

                    return {

                        title:
                            "Terrain",

                        units:
                            "m"
                    };


                default:

                    return {

                        title:
                            this.layer,

                        units:
                            ""
                    };
            }
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaRenderer =
        Object.freeze({

            Renderer,

            LAYERS,

            AIR_MASS_COLOURS
        });

})(window);
