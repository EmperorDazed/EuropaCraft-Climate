(function () {
    "use strict";

    /*
    ============================================================
    EuropaCraft Stateful Weather Engine
    Version 6.0

    Atmospheric grid:
        195 × 110
        0.4 degree

    Climate / map grid may remain:
        780 × 440
        0.1 degree

    MODEL PHILOSOPHY

    Climate = long-term boundary condition.
    Weather = evolving atmospheric state.

    Each hourly step transports:
        temperature anomaly
        moisture
        air-mass tracer

    Wind comes from:
        pressure gradients
        prevailing circulation
        weak synoptic steering

    Cloud comes from:
        moisture
        saturation tendency
        ascent/convergence
        cyclone structure
        instability

    Precipitation requires:
        moisture
        cloud
        lift/saturation

    SST modifies:
        temperature
        moisture
        instability

    ============================================================
    */


    var VERSION =
        "6.0-persistent-transport";


    /* ============================================================
       DOMAIN
    ============================================================ */

    var WEST =
        -26;

    var EAST =
        52;

    var SOUTH =
        30;

    var NORTH =
        74;

    var STEP =
        0.4;

    var WIDTH =
        Math.round(
            (EAST - WEST) /
            STEP
        );

    var HEIGHT =
        Math.round(
            (NORTH - SOUTH) /
            STEP
        );

    var CELL_COUNT =
        WIDTH *
        HEIGHT;

    var DEG =
        Math.PI /
        180;

    var TWO_PI =
        Math.PI *
        2;


    /* ============================================================
       GLOBAL RUN STATE
    ============================================================ */

    var simulationSeed =
        randomSeed();

    var climatologicalMode =
        false;


    function randomSeed() {

        return Math.floor(
            Math.random() *
            2147483646
        ) + 1;
    }


    /* ============================================================
       HELPERS
    ============================================================ */

    function clamp(
        value,
        minimum,
        maximum
    ) {

        return Math.max(
            minimum,
            Math.min(
                maximum,
                value
            )
        );
    }


    function lerp(
        a,
        b,
        amount
    ) {

        return (
            a +
            (
                b -
                a
            ) *
            amount
        );
    }


    function smoothstep(
        minimum,
        maximum,
        value
    ) {

        if (
            minimum ===
            maximum
        ) {

            return (
                value <
                minimum
                    ? 0
                    : 1
            );
        }

        var t =
            clamp(
                (
                    value -
                    minimum
                ) /
                (
                    maximum -
                    minimum
                ),
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


    function fract(
        value
    ) {

        return (
            value -
            Math.floor(
                value
            )
        );
    }


    function validDate(
        date
    ) {

        var result;

        if (
            date instanceof
            Date
        ) {

            result =
                new Date(
                    date.getTime()
                );

        } else {

            result =
                new Date(
                    date
                );
        }

        if (
            isNaN(
                result.getTime()
            )
        ) {

            result =
                new Date();
        }

        return result;
    }


    function dayNumber(
        date
    ) {

        return (
            validDate(
                date
            ).getTime() /
            86400000
        );
    }


    function dayOfYear(
        date
    ) {

        var d =
            validDate(
                date
            );

        var start =
            Date.UTC(
                d.getUTCFullYear(),
                0,
                0
            );

        var current =
            Date.UTC(
                d.getUTCFullYear(),
                d.getUTCMonth(),
                d.getUTCDate()
            );

        return Math.floor(
            (
                current -
                start
            ) /
            86400000
        );
    }


    function hash(
        number
    ) {

        var x =
            Math.sin(
                number *
                12.9898 +
                simulationSeed *
                0.000173
            ) *
            43758.5453123;

        return fract(
            x
        );
    }


    function hashXY(
        x,
        y,
        salt
    ) {

        return hash(
            x *
            127.1 +
            y *
            311.7 +
            salt *
            74.7
        );
    }


    function indexOf(
        x,
        y
    ) {

        return (
            y *
            WIDTH +
            x
        );
    }


    function latitudeForY(
        y
    ) {

        return (
            NORTH -
            (
                y +
                0.5
            ) *
            STEP
        );
    }


    function longitudeForX(
        x
    ) {

        return (
            WEST +
            (
                x +
                0.5
            ) *
            STEP
        );
    }


    function gridX(
        longitude
    ) {

        return (
            (
                longitude -
                WEST
            ) /
            STEP -
            0.5
        );
    }


    function gridY(
        latitude
    ) {

        return (
            (
                NORTH -
                latitude
            ) /
            STEP -
            0.5
        );
    }


    /* ============================================================
       VALUE NOISE

       Non-periodic spatially coherent random field.
    ============================================================ */

    function valueNoise(
        longitude,
        latitude,
        salt,
        scale
    ) {

        var x =
            longitude /
            scale;

        var y =
            latitude /
            scale;

        var x0 =
            Math.floor(
                x
            );

        var y0 =
            Math.floor(
                y
            );

        var fx =
            fract(
                x
            );

        var fy =
            fract(
                y
            );

        fx =
            fx *
            fx *
            (
                3 -
                2 *
                fx
            );

        fy =
            fy *
            fy *
            (
                3 -
                2 *
                fy
            );

        var a =
            hashXY(
                x0,
                y0,
                salt
            );

        var b =
            hashXY(
                x0 + 1,
                y0,
                salt
            );

        var c =
            hashXY(
                x0,
                y0 + 1,
                salt
            );

        var d =
            hashXY(
                x0 + 1,
                y0 + 1,
                salt
            );

        return lerp(
            lerp(
                a,
                b,
                fx
            ),
            lerp(
                c,
                d,
                fx
            ),
            fy
        );
    }


    function atmosphericNoise(
        longitude,
        latitude,
        date
    ) {

        var temporalSeed =
            Math.floor(
                dayNumber(
                    date
                ) /
                2
            );

        var broad =
            valueNoise(
                longitude,
                latitude,
                temporalSeed +
                17,
                8
            );

        var medium =
            valueNoise(
                longitude,
                latitude,
                temporalSeed +
                103,
                3.2
            );

        var fine =
            valueNoise(
                longitude,
                latitude,
                temporalSeed +
                317,
                1.4
            );

        return (
            broad *
            0.55 +
            medium *
            0.30 +
            fine *
            0.15
        );
    }


    /* ============================================================
       TEMPERATURE NORMALS

       Representative lowland climatological anchors.

       Jan ... Dec average maximum and minimum.
    ============================================================ */

    var TEMP_ANCHORS = [

        {
            lat: 51.5,
            lon: -0.5,
            high: [8,9,11,15,18,21,23,23,20,16,11,8],
            low:  [2,2,4,6,9,12,14,14,11,8,5,2]
        },

        {
            lat: 54.5,
            lon: -2.0,
            high: [7,8,10,13,16,19,21,20,17,13,9,7],
            low:  [1,1,3,5,8,11,13,12,10,7,4,1]
        },

        {
            lat: 56.5,
            lon: -4.0,
            high: [6,7,9,12,15,17,19,18,16,12,8,6],
            low:  [0,0,2,4,7,9,11,11,9,6,3,0]
        },

        {
            lat: 53.3,
            lon: -8.0,
            high: [8,9,11,13,16,18,20,20,18,14,10,8],
            low:  [3,3,4,5,8,10,12,12,10,7,5,3]
        },

        {
            lat: 47.5,
            lon: -2.0,
            high: [10,11,14,16,20,23,25,25,22,18,13,10],
            low:  [4,4,6,8,11,14,16,16,13,10,6,4]
        },

        {
            lat: 47.0,
            lon: 2.5,
            high: [7,9,13,17,21,25,27,27,23,17,11,8],
            low:  [1,1,4,6,10,13,15,15,11,8,4,2]
        },

        {
            lat: 52.5,
            lon: 13.4,
            high: [3,6,9,15,20,23,25,24,20,14,8,4],
            low:  [-1,0,1,5,9,13,15,14,11,7,3,0]
        },

        {
            lat: 52.2,
            lon: 21.0,
            high: [1.0,2.6,7.4,14.6,19.8,23.1,25.2,24.7,19.1,12.9,6.5,2.3],
            low:  [-4.0,-3.3,-0.6,4.0,8.8,12.4,14.5,13.8,9.5,5.0,1.3,-2.5]
        },

        {
            lat: 54.2,
            lon: 18.0,
            high: [2,3,7,12,17,20,22,22,18,12,7,3],
            low:  [-2,-2,0,4,8,11,14,14,10,6,2,-1]
        },

        {
            lat: 56.5,
            lon: 24.0,
            high: [-1,0,5,12,18,21,24,23,17,10,4,0],
            low:  [-6,-6,-2,3,8,12,15,14,9,4,0,-4]
        },

        {
            lat: 60.2,
            lon: 24.9,
            high: [-2,-2,2,9,16,20,23,21,16,9,3,0],
            low:  [-7,-8,-5,0,5,10,13,12,8,3,-1,-5]
        },

        {
            lat: 59.3,
            lon: 18.1,
            high: [1,1,5,11,17,21,23,22,17,11,6,2],
            low:  [-4,-4,-2,2,6,11,14,13,9,4,1,-3]
        },

        {
            lat: 59.9,
            lon: 10.7,
            high: [-1,0,5,11,17,21,22,21,16,9,3,0],
            low:  [-6,-6,-3,1,6,10,14,12,8,3,-1,-5]
        },

        {
            lat: 61.0,
            lon: 5.5,
            high: [5,5,7,10,14,17,19,19,16,11,7,5],
            low:  [1,1,2,4,7,10,12,12,9,6,3,1]
        },

        {
            lat: 68.0,
            lon: 20.0,
            high: [-8,-7,-2,4,10,15,18,16,10,3,-3,-7],
            low:  [-16,-15,-11,-5,1,6,9,7,2,-4,-10,-14]
        },

        {
            lat: 55.8,
            lon: 37.6,
            high: [-6.3,-4.2,1.5,10.4,18.4,21.7,23.1,21.5,15.4,8.2,1.1,-3.5],
            low:  [-12.3,-11.1,-5.6,1.7,7.6,11.5,13.5,12.0,7.1,2.1,-3.3,-8.6]
        },

        {
            lat: 49.5,
            lon: 31.0,
            high: [-2,0,6,15,21,25,27,27,21,13,5,0],
            low:  [-8,-7,-2,5,10,14,16,15,10,5,0,-5]
        },

        {
            lat: 47.2,
            lon: 19.3,
            high: [3,6,11,17,22,26,28,28,23,17,10,4],
            low:  [-2,-1,3,7,11,15,17,16,12,7,3,-1]
        },

        {
            lat: 44.4,
            lon: 26.1,
            high: [3,6,12,19,24,28,30,30,25,18,10,4],
            low:  [-5,-4,0,5,10,14,16,15,11,6,1,-3]
        },

        {
            lat: 43.5,
            lon: 16.4,
            high: [11,12,15,19,24,28,31,31,26,21,16,12],
            low:  [5,6,8,11,15,19,22,22,18,14,10,6]
        },

        {
            lat: 45.2,
            lon: 9.5,
            high: [7,10,14,18,23,27,30,29,24,18,12,8],
            low:  [0,2,5,9,13,17,19,18,14,10,5,1]
        },

        {
            lat: 41.9,
            lon: 12.5,
            high: [13,14,17,20,24,28,30,30,27,22,17,14],
            low:  [4,4,7,10,14,18,20,20,17,13,9,5]
        },

        {
            lat: 38.0,
            lon: 23.7,
            high: [12,13,16,21,26,31,33,33,29,23,18,14],
            low:  [5,6,8,12,16,21,22,22,19,15,10,7]
        },

        {
            lat: 41.0,
            lon: 29.0,
            high: [9,10,13,18,22,27,30,30,26,21,16,11],
            low:  [4,4,6,10,14,19,22,22,18,14,9,6]
        },

        {
            lat: 39.0,
            lon: 33.0,
            high: [4,7,12,18,23,28,32,32,27,20,12,6],
            low:  [-5,-4,0,5,9,13,16,16,11,6,1,-3]
        },

        {
            lat: 40.4,
            lon: -3.7,
            high: [11,13,17,19,23,29,33,33,28,21,15,11],
            low:  [1,2,5,7,11,15,18,18,14,9,4,2]
        },

        {
            lat: 38.7,
            lon: -9.1,
            high: [15,16,18,20,22,26,28,29,27,23,18,15],
            low:  [8,9,10,12,14,17,18,19,18,15,11,9]
        },

        {
            lat: 39.5,
            lon: -0.5,
            high: [16,17,19,21,24,28,31,31,28,24,19,16],
            low:  [7,8,10,12,16,20,23,23,20,16,11,8]
        },

        {
            lat: 35.0,
            lon: 5.0,
            high: [16,17,20,23,27,31,35,35,31,26,21,17],
            low:  [7,8,10,13,17,21,24,24,21,17,12,8]
        }
    ];


    function monthPosition(
        date
    ) {

        var d =
            validDate(
                date
            );

        var month =
            d.getUTCMonth();

        var nextMonth =
            (
                month +
                1
            ) %
            12;

        var start =
            Date.UTC(
                d.getUTCFullYear(),
                month,
                1
            );

        var next;

        if (
            month ===
            11
        ) {

            next =
                Date.UTC(
                    d.getUTCFullYear() + 1,
                    0,
                    1
                );

        } else {

            next =
                Date.UTC(
                    d.getUTCFullYear(),
                    month + 1,
                    1
                );
        }

        var amount =
            clamp(
                (
                    d.getTime() -
                    start
                ) /
                (
                    next -
                    start
                ),
                0,
                1
            );

        return {
            month:
                month,

            next:
                nextMonth,

            amount:
                amount
        };
    }


    function interpolatedNormals(
        latitude,
        longitude,
        date
    ) {

        var month =
            monthPosition(
                date
            );

        var high =
            0;

        var low =
            0;

        var total =
            0;

        var i;

        for (
            i = 0;
            i <
            TEMP_ANCHORS.length;
            i++
        ) {

            var anchor =
                TEMP_ANCHORS[i];

            var dy =
                latitude -
                anchor.lat;

            var dx =
                (
                    longitude -
                    anchor.lon
                ) *
                Math.cos(
                    latitude *
                    DEG
                );

            var distance =
                Math.sqrt(
                    dx *
                    dx +
                    dy *
                    dy
                );

            var weight =
                1 /
                Math.pow(
                    distance +
                    1.4,
                    2.2
                );

            if (
                distance <
                2
            ) {

                weight *=
                    3;
            }

            var anchorHigh =
                lerp(
                    anchor.high[
                        month.month
                    ],
                    anchor.high[
                        month.next
                    ],
                    month.amount
                );

            var anchorLow =
                lerp(
                    anchor.low[
                        month.month
                    ],
                    anchor.low[
                        month.next
                    ],
                    month.amount
                );

            high +=
                anchorHigh *
                weight;

            low +=
                anchorLow *
                weight;

            total +=
                weight;
        }

        return {
            high:
                high /
                total,

            low:
                low /
                total
        };
    }


    /* ============================================================
       LOCAL CLIMATE
    ============================================================ */

    function getClimate(
        latitude,
        longitude,
        landFraction
    ) {

        if (
            window.EuropaClimate &&
            typeof window.EuropaClimate.getIndices ===
                "function"
        ) {

            try {

                return window.EuropaClimate.getIndices(
                    latitude,
                    longitude,
                    {
                        landFraction:
                            landFraction
                    }
                );

            } catch (
                error
            ) {

                return null;
            }
        }

        return null;
    }


    function climateIndex(
        climate,
        name
    ) {

        if (
            climate &&
            climate.indices &&
            typeof climate.indices[name] ===
                "number"
        ) {

            return climate.indices[
                name
            ];
        }

        return 0;
    }


    function climateWeight(
        climate,
        name
    ) {

        if (
            climate &&
            climate.normalized &&
            typeof climate.normalized[name] ===
                "number"
        ) {

            return (
                climate.normalized[
                    name
                ] /
                100
            );
        }

        return 0;
    }


    /* ============================================================
       SST
    ============================================================ */

    function seaSurfaceTemperature(
        latitude,
        longitude,
        date,
        climate
    ) {

        var phase =
            Math.cos(
                TWO_PI *
                (
                    dayOfYear(
                        date
                    ) -
                    238
                ) /
                365.2422
            );

        var atlantic =
            climateWeight(
                climate,
                "Atlantic"
            ) +
            climateWeight(
                climate,
                "Polar Maritime"
            );

        var northSea =
            climateWeight(
                climate,
                "North Sea"
            );

        var baltic =
            climateWeight(
                climate,
                "Baltic Maritime"
            );

        var mediterranean =
            climateWeight(
                climate,
                "Mediterranean"
            );

        var blackSea =
            climateWeight(
                climate,
                "Black Sea"
            );

        var caspian =
            climateWeight(
                climate,
                "Caspian Maritime"
            );

        var total =
            atlantic +
            northSea +
            baltic +
            mediterranean +
            blackSea +
            caspian;

        if (
            total <
            0.05
        ) {

            atlantic =
                1;

            total =
                1;
        }

        var atlanticMean =
            14 -
            Math.max(
                0,
                latitude -
                40
            ) *
            0.22;

        var atlanticAmplitude =
            3.5 +
            Math.max(
                0,
                latitude -
                45
            ) *
            0.04;

        var result =
            atlantic *
            (
                atlanticMean +
                atlanticAmplitude *
                phase
            );

        result +=
            northSea *
            (
                10.7 +
                5.9 *
                phase
            );

        result +=
            baltic *
            (
                8.0 +
                9.2 *
                phase
            );

        result +=
            mediterranean *
            (
                19.0 +
                6.5 *
                phase
            );

        result +=
            blackSea *
            (
                13.5 +
                9.5 *
                phase
            );

        result +=
            caspian *
            (
                13.0 +
                10.5 *
                phase
            );

        return (
            result /
            total
        );
    }


    /* ============================================================
       DAILY CLIMATOLOGICAL TEMPERATURE
    ============================================================ */

    function localSolarHour(
        longitude,
        date
    ) {

        var d =
            validDate(
                date
            );

        var hour =
            d.getUTCHours() +
            d.getUTCMinutes() /
            60 +
            longitude /
            15;

        return (
            (
                hour %
                24
            ) +
            24
        ) %
        24;
    }


    function climatologicalTemperature(
        latitude,
        longitude,
        date,
        climate,
        landFraction
    ) {

        var normal =
            interpolatedNormals(
                latitude,
                longitude,
                date
            );

        var maritime =
            climateIndex(
                climate,
                "maritime"
            );

        var continental =
            climateIndex(
                climate,
                "continental"
            );

        var mean =
            (
                normal.high +
                normal.low
            ) /
            2;

        var range =
            normal.high -
            normal.low;

        /*
         * Maritime regions have smaller diurnal range.
         */
        range *=
            clamp(
                1 -
                maritime *
                0.22,
                0.70,
                1
            );

        /*
         * Continental regions slightly larger.
         */
        range *=
            (
                1 +
                continental *
                0.12
            );

        if (
            landFraction <
            0.5
        ) {

            range *=
                lerp(
                    0.22,
                    1,
                    landFraction *
                    2
                );
        }

        var hour =
            localSolarHour(
                longitude,
                date
            );

        /*
         * Approx. maximum 14:30 solar time.
         */
        var phase =
            (
                hour -
                14.5
            ) /
            24 *
            TWO_PI;

        return (
            mean +
            Math.cos(
                phase
            ) *
            range /
            2
        );
    }


    /* ============================================================
       SURFACE PROVIDER

       The UI can install a real land / sea callback.

       Without one, climate weights provide an estimate.
    ============================================================ */

    var surfaceProvider =
        null;


    function setSurfaceProvider(
        provider
    ) {

        if (
            typeof provider ===
            "function"
        ) {

            surfaceProvider =
                provider;

        } else {

            surfaceProvider =
                null;
        }
    }


    function estimatedLandFraction(
        latitude,
        longitude
    ) {

        if (
            surfaceProvider
        ) {

            var supplied =
                Number(
                    surfaceProvider(
                        latitude,
                        longitude
                    )
                );

            if (
                isFinite(
                    supplied
                )
            ) {

                return clamp(
                    supplied,
                    0,
                    1
                );
            }
        }

        /*
         * Fallback:
         * infer broadly from climate mix.
         */

        var climate =
            getClimate(
                latitude,
                longitude,
                0.5
            );

        var sea =
            climateWeight(
                climate,
                "Atlantic"
            ) +
            climateWeight(
                climate,
                "North Sea"
            ) +
            climateWeight(
                climate,
                "Baltic Maritime"
            ) +
            climateWeight(
                climate,
                "Mediterranean"
            ) +
            climateWeight(
                climate,
                "Black Sea"
            ) +
            climateWeight(
                climate,
                "Caspian Maritime"
            );

        return clamp(
            1 -
            sea,
            0,
            1
        );
    }


    /* ============================================================
       SYNOPTIC SYSTEM GENERATION
    ============================================================ */

    function systemCycle(
        date
    ) {

        return Math.floor(
            dayNumber(
                date
            ) /
            5
        );
    }


    function systemRandom(
        cycle,
        system,
        salt
    ) {

        return hash(
            cycle *
            7001 +
            system *
            3911 +
            salt *
            997
        );
    }


    function synopticSystems(
        date
    ) {

        if (
            climatologicalMode
        ) {

            return [];
        }

        var cycle =
            systemCycle(
                date
            );

        var progress =
            fract(
                dayNumber(
                    date
                ) /
                5
            );

        var systems =
            [];

        var count =
            3;

        var i;

        for (
            i = 0;
            i <
            count;
            i++
        ) {

            var startLon =
                -34 +
                systemRandom(
                    cycle,
                    i,
                    1
                ) *
                18;

            var endLon =
                20 +
                systemRandom(
                    cycle,
                    i,
                    2
                ) *
                34;

            var latitude =
                47 +
                systemRandom(
                    cycle,
                    i,
                    3
                ) *
                19;

            /*
             * Gentle curved track.
             */
            latitude +=
                Math.sin(
                    progress *
                    Math.PI
                ) *
                (
                    systemRandom(
                        cycle,
                        i,
                        4
                    ) -
                    0.5
                ) *
                8;

            var longitude =
                lerp(
                    startLon,
                    endLon,
                    progress
                ) +
                i *
                12;

            systems.push({
                type:
                    "low",

                lat:
                    latitude,

                lon:
                    longitude,

                depth:
                    10 +
                    systemRandom(
                        cycle,
                        i,
                        5
                    ) *
                    16,

                radius:
                    7 +
                    systemRandom(
                        cycle,
                        i,
                        6
                    ) *
                    7
            });
        }

        /*
         * High pressure centre.
         */
        systems.push({
            type:
                "high",

            lat:
                40 +
                systemRandom(
                    cycle,
                    8,
                    1
                ) *
                18,

            lon:
                -12 +
                systemRandom(
                    cycle,
                    8,
                    2
                ) *
                45,

            depth:
                7 +
                systemRandom(
                    cycle,
                    8,
                    3
                ) *
                10,

            radius:
                13 +
                systemRandom(
                    cycle,
                    8,
                    4
                ) *
                9
        });

        return systems;
    }


    /* ============================================================
       PRESSURE
    ============================================================ */

    function pressureAt(
        latitude,
        longitude,
        date
    ) {

        if (
            climatologicalMode
        ) {

            /*
             * Quiet climatological background.
             */
            return (
                1015 -
                (
                    latitude -
                    50
                ) *
                0.03
            );
        }

        var pressure =
            1015;

        var systems =
            synopticSystems(
                date
            );

        var i;

        for (
            i = 0;
            i <
            systems.length;
            i++
        ) {

            var system =
                systems[i];

            var dy =
                latitude -
                system.lat;

            var dx =
                (
                    longitude -
                    system.lon
                ) *
                Math.cos(
                    latitude *
                    DEG
                );

            var distanceSquared =
                dx *
                dx +
                dy *
                dy;

            var influence =
                Math.exp(
                    -distanceSquared /
                    (
                        2 *
                        system.radius *
                        system.radius
                    )
                );

            if (
                system.type ===
                "low"
            ) {

                pressure -=
                    system.depth *
                    influence;

            } else {

                pressure +=
                    system.depth *
                    influence;
            }
        }

        /*
         * Weak irregular background pressure structure.
         */
        pressure +=
            (
                atmosphericNoise(
                    longitude,
                    latitude,
                    date
                ) -
                0.5
            ) *
            3;

        return pressure;
    }


    /* ============================================================
       WIND
    ============================================================ */

    function pressureGradient(
        latitude,
        longitude,
        date
    ) {

        var delta =
            0.3;

        var north =
            pressureAt(
                latitude +
                delta,
                longitude,
                date
            );

        var south =
            pressureAt(
                latitude -
                delta,
                longitude,
                date
            );

        var east =
            pressureAt(
                latitude,
                longitude +
                delta,
                date
            );

        var west =
            pressureAt(
                latitude,
                longitude -
                delta,
                date
            );

        return {
            northSouth:
                (
                    north -
                    south
                ) /
                (
                    2 *
                    delta
                ),

            eastWest:
                (
                    east -
                    west
                ) /
                (
                    2 *
                    delta
                )
        };
    }


    function windAt(
        latitude,
        longitude,
        date
    ) {

        var gradient =
            pressureGradient(
                latitude,
                longitude,
                date
            );

        /*
         * Mid-latitude background westerlies.
         */
        var westerly =
            2.2 *
            smoothstep(
                35,
                48,
                latitude
            ) *
            (
                1 -
                smoothstep(
                    70,
                    75,
                    latitude
                )
            );

        /*
         * Atmospheric pressure-gradient contribution.
         *
         * Chosen for useful surface-scale winds rather than
         * literal free-atmosphere geostrophic wind.
         */
        var u =
            -gradient.northSouth *
            10.5 +
            westerly;

        var v =
            gradient.eastWest *
            10.5;

        /*
         * Small spatial irregularity.
         */
        if (
            !climatologicalMode
        ) {

            var variation =
                atmosphericNoise(
                    longitude,
                    latitude,
                    date
                ) -
                0.5;

            u +=
                variation *
                1.0;

            v +=
                variation *
                0.6;
        }

        var speed =
            Math.sqrt(
                u *
                u +
                v *
                v
            );

        if (
            speed >
            30
        ) {

            var scale =
                30 /
                speed;

            u *=
                scale;

            v *=
                scale;

            speed =
                30;
        }

        var direction =
            (
                Math.atan2(
                    -u,
                    -v
                ) /
                DEG +
                360
            ) %
            360;

        return {
            uMs:
                u,

            vMs:
                v,

            speedMs:
                speed,

            directionDeg:
                direction
        };
    }


    /* ============================================================
       BILINEAR SAMPLING
    ============================================================ */

    function sampleArray(
        array,
        x,
        y
    ) {

        x =
            clamp(
                x,
                0,
                WIDTH -
                1.001
            );

        y =
            clamp(
                y,
                0,
                HEIGHT -
                1.001
            );

        var x0 =
            Math.floor(
                x
            );

        var y0 =
            Math.floor(
                y
            );

        var x1 =
            Math.min(
                WIDTH - 1,
                x0 + 1
            );

        var y1 =
            Math.min(
                HEIGHT - 1,
                y0 + 1
            );

        var fx =
            x -
            x0;

        var fy =
            y -
            y0;

        var a =
            array[
                indexOf(
                    x0,
                    y0
                )
            ];

        var b =
            array[
                indexOf(
                    x1,
                    y0
                )
            ];

        var c =
            array[
                indexOf(
                    x0,
                    y1
                )
            ];

        var d =
            array[
                indexOf(
                    x1,
                    y1
                )
            ];

        return lerp(
            lerp(
                a,
                b,
                fx
            ),
            lerp(
                c,
                d,
                fx
            ),
            fy
        );
    }


    /* ============================================================
       WEATHER WORLD
    ============================================================ */

    function WeatherWorld(
        startDate
    ) {

        this.date =
            validDate(
                startDate
            );

        this.startDate =
            new Date(
                this.date.getTime()
            );

        this.hoursElapsed =
            0;

        /*
         * Persistent atmospheric fields.
         */
        this.temperature =
            new Float32Array(
                CELL_COUNT
            );

        this.temperatureAnomaly =
            new Float32Array(
                CELL_COUNT
            );

        this.moisture =
            new Float32Array(
                CELL_COUNT
            );

        this.cloud =
            new Float32Array(
                CELL_COUNT
            );

        this.precipitation =
            new Float32Array(
                CELL_COUNT
            );

        this.pressure =
            new Float32Array(
                CELL_COUNT
            );

        this.windU =
            new Float32Array(
                CELL_COUNT
            );

        this.windV =
            new Float32Array(
                CELL_COUNT
            );

        /*
         * Air-mass tracer:
         *
         * -1 = cold-origin air
         *  0 = climatological/local
         * +1 = warm-origin air
         */
        this.airMass =
            new Float32Array(
                CELL_COUNT
            );

        /*
         * Scratch arrays.
         */
        this.nextAnomaly =
            new Float32Array(
                CELL_COUNT
            );

        this.nextMoisture =
            new Float32Array(
                CELL_COUNT
            );

        this.nextAirMass =
            new Float32Array(
                CELL_COUNT
            );

        this.landFraction =
            new Float32Array(
                CELL_COUNT
            );

        this.sst =
            new Float32Array(
                CELL_COUNT
            );

        this.initialize();
    }


    /* ============================================================
       WORLD INITIALIZATION
    ============================================================ */

    WeatherWorld.prototype.initialize =
        function () {

            var x;
            var y;

            for (
                y = 0;
                y < HEIGHT;
                y++
            ) {

                var latitude =
                    latitudeForY(
                        y
                    );

                for (
                    x = 0;
                    x < WIDTH;
                    x++
                ) {

                    var longitude =
                        longitudeForX(
                            x
                        );

                    var index =
                        indexOf(
                            x,
                            y
                        );

                    var land =
                        estimatedLandFraction(
                            latitude,
                            longitude
                        );

                    this.landFraction[
                        index
                    ] =
                        land;

                    var climate =
                        getClimate(
                            latitude,
                            longitude,
                            land
                        );

                    var normal =
                        climatologicalTemperature(
                            latitude,
                            longitude,
                            this.date,
                            climate,
                            land
                        );

                    var seaTemperature =
                        seaSurfaceTemperature(
                            latitude,
                            longitude,
                            this.date,
                            climate
                        );

                    this.sst[
                        index
                    ] =
                        seaTemperature;

                    /*
                     * Initial run anomaly.
                     *
                     * Moderate, not V5's huge fixed regime
                     * departures.
                     */
                    var noise =
                        atmosphericNoise(
                            longitude,
                            latitude,
                            this.date
                        );

                    var seasonalContrast =
                        1.2 +
                        1.5 *
                        Math.abs(
                            Math.cos(
                                TWO_PI *
                                (
                                    dayOfYear(
                                        this.date
                                    ) -
                                    15
                                ) /
                                365.2422
                            )
                        );

                    var anomaly =
                        (
                            noise -
                            0.5
                        ) *
                        seasonalContrast *
                        2.2;

                    if (
                        climatologicalMode
                    ) {

                        anomaly =
                            0;
                    }

                    this.temperatureAnomaly[
                        index
                    ] =
                        anomaly;

                    this.temperature[
                        index
                    ] =
                        normal +
                        anomaly;

                    /*
                     * Starting moisture.
                     */
                    var maritime =
                        climateIndex(
                            climate,
                            "maritime"
                        );

                    this.moisture[
                        index
                    ] =
                        clamp(
                            0.38 +
                            maritime *
                            0.30 +
                            (
                                1 -
                                land
                            ) *
                            0.18 +
                            (
                                noise -
                                0.5
                            ) *
                            0.12,
                            0.12,
                            0.95
                        );

                    this.airMass[
                        index
                    ] =
                        clamp(
                            anomaly /
                            6,
                            -1,
                            1
                        );
                }
            }

            this.recalculateDiagnosticFields();
        };


    /* ============================================================
       DIAGNOSTIC FIELDS
    ============================================================ */

    WeatherWorld.prototype.recalculateDiagnosticFields =
        function () {

            var x;
            var y;

            /*
             * First pressure / wind.
             */
            for (
                y = 0;
                y < HEIGHT;
                y++
            ) {

                var latitude =
                    latitudeForY(
                        y
                    );

                for (
                    x = 0;
                    x < WIDTH;
                    x++
                ) {

                    var longitude =
                        longitudeForX(
                            x
                        );

                    var index =
                        indexOf(
                            x,
                            y
                        );

                    var p =
                        pressureAt(
                            latitude,
                            longitude,
                            this.date
                        );

                    var wind =
                        windAt(
                            latitude,
                            longitude,
                            this.date
                        );

                    this.pressure[
                        index
                    ] =
                        p;

                    this.windU[
                        index
                    ] =
                        wind.uMs;

                    this.windV[
                        index
                    ] =
                        wind.vMs;
                }
            }

            /*
             * Cloud and precipitation.
             */
            for (
                y = 0;
                y < HEIGHT;
                y++
            ) {

                for (
                    x = 0;
                    x < WIDTH;
                    x++
                ) {

                    var i =
                        indexOf(
                            x,
                            y
                        );

                    var xWest =
                        Math.max(
                            0,
                            x - 1
                        );

                    var xEast =
                        Math.min(
                            WIDTH - 1,
                            x + 1
                        );

                    var yNorth =
                        Math.max(
                            0,
                            y - 1
                        );

                    var ySouth =
                        Math.min(
                            HEIGHT - 1,
                            y + 1
                        );

                    /*
                     * Wind convergence.
                     *
                     * Positive means air is converging.
                     */
                    var du =
                        this.windU[
                            indexOf(
                                xEast,
                                y
                            )
                        ] -
                        this.windU[
                            indexOf(
                                xWest,
                                y
                            )
                        ];

                    var dv =
                        this.windV[
                            indexOf(
                                x,
                                ySouth
                            )
                        ] -
                        this.windV[
                            indexOf(
                                x,
                                yNorth
                            )
                        ];

                    var convergence =
                        clamp(
                            -(
                                du +
                                dv
                            ) /
                            12,
                            0,
                            1
                        );

                    var lowLift =
                        clamp(
                            (
                                1017 -
                                this.pressure[
                                    i
                                ]
                            ) /
                            17,
                            0,
                            1
                        );

                    var seaInstability =
                        clamp(
                            (
                                this.sst[
                                    i
                                ] -
                                this.temperature[
                                    i
                                ] -
                                1
                            ) /
                            9,
                            0,
                            1
                        );

                    /*
                     * Cloud only forms readily once there
                     * is substantial atmospheric moisture.
                     */
                    var saturation =
                        smoothstep(
                            0.48,
                            0.78,
                            this.moisture[
                                i
                            ]
                        );

                    var cloud =
                        saturation *
                        0.52;

                    cloud +=
                        lowLift *
                        this.moisture[
                            i
                        ] *
                        0.42;

                    cloud +=
                        convergence *
                        this.moisture[
                            i
                        ] *
                        0.72;

                    cloud +=
                        seaInstability *
                        (
                            1 -
                            this.landFraction[
                                i
                            ]
                        ) *
                        this.moisture[
                            i
                        ] *
                        0.42;

                    /*
                     * Break cloud edges slightly, but noise
                     * cannot create cloud by itself.
                     */
                    var localNoise =
                        atmosphericNoise(
                            longitudeForX(
                                x
                            ),
                            latitudeForY(
                                y
                            ),
                            this.date
                        );

                    cloud *=
                        0.86 +
                        localNoise *
                        0.22;

                    /*
                     * Strong anticyclonic subsidence.
                     */
                    if (
                        this.pressure[
                            i
                        ] >
                        1023
                    ) {

                        cloud *=
                            0.62;
                    }

                    cloud =
                        clamp(
                            cloud,
                            0.01,
                            1
                        );

                    this.cloud[
                        i
                    ] =
                        cloud;

                    /*
                     * Precipitation.

                     * Requires both condensate and a lifting
                     * mechanism.
                     */
                    var lift =
                        Math.max(
                            convergence,
                            lowLift *
                            0.72,
                            seaInstability *
                            (
                                1 -
                                this.landFraction[
                                    i
                                ]
                            ) *
                            0.60
                        );

                    var precipPotential =
                        this.moisture[
                            i
                        ] *
                        cloud *
                        (
                            0.30 +
                            lift
                        );

                    var precip =
                        smoothstep(
                            0.16,
                            0.48,
                            precipPotential
                        );

                    /*
                     * Broad low-pressure rain can still occur
                     * without extreme convergence.
                     */
                    if (
                        lowLift >
                        0.35 &&
                        cloud >
                        0.60 &&
                        this.moisture[
                            i
                        ] >
                        0.55
                    ) {

                        precip =
                            Math.max(
                                precip,
                                lowLift *
                                cloud *
                                0.55
                            );
                    }

                    this.precipitation[
                        i
                    ] =
                        clamp(
                            precip,
                            0,
                            1
                        );
                }
            }
        };


    /* ============================================================
       ONE-HOUR ATMOSPHERIC STEP
    ============================================================ */

    WeatherWorld.prototype.step =
        function (
            hours
        ) {

            var count =
                Math.max(
                    1,
                    Math.floor(
                        Number(
                            hours
                        ) ||
                        1
                    )
                );

            var step;

            for (
                step = 0;
                step < count;
                step++
            ) {

                this.stepOneHour();
            }
        };


    WeatherWorld.prototype.stepOneHour =
        function () {

            var x;
            var y;

            /*
             * Update synoptic pressure and winds at current
             * atmospheric time.
             */
            this.recalculateDiagnosticFields();

            /*
             * TRANSPORT PASS
             *
             * Semi-Lagrangian advection:
             *
             * For every destination cell we trace backward
             * along the wind and sample where the air came
             * from one hour earlier.
             */
            for (
                y = 0;
                y < HEIGHT;
                y++
            ) {

                var latitude =
                    latitudeForY(
                        y
                    );

                var cosLatitude =
                    Math.max(
                        0.25,
                        Math.cos(
                            latitude *
                            DEG
                        )
                    );

                for (
                    x = 0;
                    x < WIDTH;
                    x++
                ) {

                    var longitude =
                        longitudeForX(
                            x
                        );

                    var index =
                        indexOf(
                            x,
                            y
                        );

                    var u =
                        this.windU[
                            index
                        ];

                    var v =
                        this.windV[
                            index
                        ];

                    /*
                     * Approximate degree displacement in one hour.

                     * 1 degree latitude approx 111 km.
                     */
                    var northDegrees =
                        (
                            v *
                            3600
                        ) /
                        111000;

                    var eastDegrees =
                        (
                            u *
                            3600
                        ) /
                        (
                            111000 *
                            cosLatitude
                        );

                    /*
                     * Backtrace.
                     */
                    var sourceLat =
                        latitude -
                        northDegrees;

                    var sourceLon =
                        longitude -
                        eastDegrees;

                    var sourceX =
                        gridX(
                            sourceLon
                        );

                    var sourceY =
                        gridY(
                            sourceLat
                        );

                    var transportedAnomaly =
                        sampleArray(
                            this.temperatureAnomaly,
                            sourceX,
                            sourceY
                        );

                    var transportedMoisture =
                        sampleArray(
                            this.moisture,
                            sourceX,
                            sourceY
                        );

                    var transportedAirMass =
                        sampleArray(
                            this.airMass,
                            sourceX,
                            sourceY
                        );

                    var land =
                        this.landFraction[
                            index
                        ];

                    var climate =
                        getClimate(
                            latitude,
                            longitude,
                            land
                        );

                    var normal =
                        climatologicalTemperature(
                            latitude,
                            longitude,
                            this.date,
                            climate,
                            land
                        );

                    var sst =
                        seaSurfaceTemperature(
                            latitude,
                            longitude,
                            this.date,
                            climate
                        );

                    this.sst[
                        index
                    ] =
                        sst;

                    /*
                     * ==================================================
                     * AIR / SURFACE TEMPERATURE EXCHANGE
                     * ==================================================
                     */

                    var anomaly =
                        transportedAnomaly;

                    if (
                        climatologicalMode
                    ) {

                        anomaly =
                            0;

                    } else {

                        /*
                         * Relax anomalies slowly toward zero.

                         * About ~6 day e-folding rather than
                         * instantly losing air-mass identity.
                         */
                        anomaly *=
                            0.993;

                        /*
                         * Sea modifies passing air.
                         */
                        if (
                            land <
                            0.45
                        ) {

                            var transportedTemperature =
                                normal +
                                anomaly;

                            var seaDifference =
                                sst -
                                transportedTemperature;

                            anomaly +=
                                seaDifference *
                                (
                                    0.018 +
                                    (
                                        1 -
                                        land
                                    ) *
                                    0.030
                                );
                        }

                        /*
                         * Land responds more quickly to local
                         * climatological surface temperature.
                         */
                        if (
                            land >
                            0.55
                        ) {

                            anomaly *=
                                0.996;
                        }

                        /*
                         * Clear calm nighttime continental
                         * radiative cooling.
                         */
                        var localHour =
                            localSolarHour(
                                longitude,
                                this.date
                            );

                        var night =
                            (
                                localHour >
                                18 ||
                                localHour <
                                7
                            );

                        var speed =
                            Math.sqrt(
                                u *
                                u +
                                v *
                                v
                            );

                        if (
                            night &&
                            land >
                            0.65 &&
                            this.cloud[
                                index
                            ] <
                            0.30 &&
                            speed <
                            3
                        ) {

                            anomaly -=
                                0.035;
                        }

                        /*
                         * Clear daytime land heating.
                         */
                        if (
                            !night &&
                            land >
                            0.65 &&
                            this.cloud[
                                index
                            ] <
                            0.30
                        ) {

                            anomaly +=
                                0.020;
                        }
                    }


                    /* ==================================================
                       MOISTURE TRANSPORT / SOURCES
                       ================================================== */

                    var moisture =
                        transportedMoisture;

                    /*
                     * Moisture evaporates from sea.
                     */
                    if (
                        land <
                        0.45
                    ) {

                        var evaporation =
                            0.004 +
                            (
                                1 -
                                land
                            ) *
                            0.010;

                        /*
                         * Stronger wind increases sea-air exchange.
                         */
                        evaporation *=
                            clamp(
                                0.7 +
                                Math.sqrt(
                                    u * u +
                                    v * v
                                ) /
                                8,
                                0.7,
                                2.2
                            );

                        moisture +=
                            evaporation;
                    }

                    /*
                     * Slow drying over land.
                     */
                    if (
                        land >
                        0.60
                    ) {

                        moisture -=
                            0.0025;
                    }

                    /*
                     * Existing precipitation removes moisture.
                     */
                    moisture -=
                        this.precipitation[
                            index
                        ] *
                        0.020;

                    moisture =
                        clamp(
                            moisture,
                            0.05,
                            1
                        );

                    /*
                     * Air-mass tracer changes slowly through
                     * local modification.
                     */
                    var airMass =
                        transportedAirMass;

                    airMass =
                        lerp(
                            airMass,
                            clamp(
                                anomaly /
                                7,
                                -1,
                                1
                            ),
                            0.015
                        );

                    this.nextAnomaly[
                        index
                    ] =
                        clamp(
                            anomaly,
                            -10,
                            10
                        );

                    this.nextMoisture[
                        index
                    ] =
                        moisture;

                    this.nextAirMass[
                        index
                    ] =
                        clamp(
                            airMass,
                            -1,
                            1
                        );
                }
            }


            /* ======================================================
               SWAP TRANSPORT BUFFERS
            ====================================================== */

            var oldAnomaly =
                this.temperatureAnomaly;

            this.temperatureAnomaly =
                this.nextAnomaly;

            this.nextAnomaly =
                oldAnomaly;

            var oldMoisture =
                this.moisture;

            this.moisture =
                this.nextMoisture;

            this.nextMoisture =
                oldMoisture;

            var oldAirMass =
                this.airMass;

            this.airMass =
                this.nextAirMass;

            this.nextAirMass =
                oldAirMass;


            /* ======================================================
               ADVANCE TIME
            ====================================================== */

            this.date =
                new Date(
                    this.date.getTime() +
                    3600000
                );

            this.hoursElapsed++;


            /* ======================================================
               CALCULATE ACTUAL TEMPERATURE FROM NEW STATE
            ====================================================== */

            for (
                y = 0;
                y < HEIGHT;
                y++
            ) {

                var tempLatitude =
                    latitudeForY(
                        y
                    );

                for (
                    x = 0;
                    x < WIDTH;
                    x++
                ) {

                    var tempLongitude =
                        longitudeForX(
                            x
                        );

                    var tempIndex =
                        indexOf(
                            x,
                            y
                        );

                    var tempLand =
                        this.landFraction[
                            tempIndex
                        ];

                    var tempClimate =
                        getClimate(
                            tempLatitude,
                            tempLongitude,
                            tempLand
                        );

                    var localNormal =
                        climatologicalTemperature(
                            tempLatitude,
                            tempLongitude,
                            this.date,
                            tempClimate,
                            tempLand
                        );

                    var actual =
                        localNormal +
                        this.temperatureAnomaly[
                            tempIndex
                        ];

                    /*
                     * Cloud narrows diurnal departures slightly.
                     */
                    if (
                        this.cloud[
                            tempIndex
                        ] >
                        0.70
                    ) {

                        var normalMean =
                            (
                                interpolatedNormals(
                                    tempLatitude,
                                    tempLongitude,
                                    this.date
                                ).high +
                                interpolatedNormals(
                                    tempLatitude,
                                    tempLongitude,
                                    this.date
                                ).low
                            ) /
                            2;

                        actual =
                            lerp(
                                actual,
                                normalMean +
                                this.temperatureAnomaly[
                                    tempIndex
                                ],
                                0.15
                            );
                    }

                    this.temperature[
                        tempIndex
                    ] =
                        actual;
                }
            }

            this.recalculateDiagnosticFields();
        };


    /* ============================================================
       GRID SAMPLE
    ============================================================ */

    WeatherWorld.prototype.sample =
        function (
            latitude,
            longitude
        ) {

            var x =
                gridX(
                    longitude
                );

            var y =
                gridY(
                    latitude
                );

            var temperature =
                sampleArray(
                    this.temperature,
                    x,
                    y
                );

            var anomaly =
                sampleArray(
                    this.temperatureAnomaly,
                    x,
                    y
                );

            var moisture =
                sampleArray(
                    this.moisture,
                    x,
                    y
                );

            var cloud =
                sampleArray(
                    this.cloud,
                    x,
                    y
                );

            var precipitation =
                sampleArray(
                    this.precipitation,
                    x,
                    y
                );

            var pressure =
                sampleArray(
                    this.pressure,
                    x,
                    y
                );

            var u =
                sampleArray(
                    this.windU,
                    x,
                    y
                );

            var v =
                sampleArray(
                    this.windV,
                    x,
                    y
                );

            var speed =
                Math.sqrt(
                    u * u +
                    v * v
                );

            var direction =
                (
                    Math.atan2(
                        -u,
                        -v
                    ) /
                    DEG +
                    360
                ) %
                360;

            var land =
                estimatedLandFraction(
                    latitude,
                    longitude
                );

            var climate =
                getClimate(
                    latitude,
                    longitude,
                    land
                );

            var sst =
                seaSurfaceTemperature(
                    latitude,
                    longitude,
                    this.date,
                    climate
                );

            var phase =
                "dry";

            if (
                precipitation >
                0.04
            ) {

                if (
                    temperature <=
                    1.5
                ) {

                    phase =
                        "snow";

                } else if (
                    temperature <=
                    3
                ) {

                    phase =
                        "sleet";

                } else {

                    phase =
                        "rain";
                }
            }

            return {

                date:
                    this.date.toISOString(),

                lat:
                    latitude,

                lon:
                    longitude,

                simulationSeed:
                    simulationSeed,

                climatologicalMode:
                    climatologicalMode,

                temperatureC:
                    temperature,

                temperatureAnomalyC:
                    anomaly,

                seaSurfaceTemperatureC:
                    sst,

                moisture:
                    moisture,

                humidityPct:
                    clamp(
                        25 +
                        moisture *
                        72,
                        20,
                        100
                    ),

                pressureHpa:
                    pressure,

                cloudFraction:
                    cloud,

                precipitationIntensity:
                    precipitation,

                precipitationChance:
                    clamp(
                        precipitation *
                        1.6,
                        0,
                        1
                    ),

                precipitationType:
                    phase,

                airMass:
                    sampleArray(
                        this.airMass,
                        x,
                        y
                    ),

                wind: {

                    uMs:
                        u,

                    vMs:
                        v,

                    speedMs:
                        speed,

                    directionDeg:
                        direction
                }
            };
        };


    /* ============================================================
       LEGACY SIMULATE()

       Kept so old UI calls do not crash.

       This creates a short-lived world and samples it.
    ============================================================ */

    function simulate(
        latitude,
        longitude,
        date,
        options
    ) {

        var world =
            new WeatherWorld(
                date
            );

        return world.sample(
            latitude,
            longitude
        );
    }


    /* ============================================================
       TRACER PARTICLES
    ============================================================ */

    function createParticles(
        count
    ) {

        var particles =
            [];

        var maximum =
            clamp(
                Math.floor(
                    Number(
                        count
                    ) ||
                    250
                ),
                10,
                1500
            );

        var i;

        for (
            i = 0;
            i < maximum;
            i++
        ) {

            particles.push({

                lat:
                    SOUTH +
                    hash(
                        i *
                        193 +
                        17
                    ) *
                    (
                        NORTH -
                        SOUTH
                    ),

                lon:
                    WEST +
                    hash(
                        i *
                        389 +
                        29
                    ) *
                    (
                        EAST -
                        WEST
                    ),

                age:
                    Math.floor(
                        hash(
                            i *
                            617 +
                            43
                        ) *
                        48
                    )
            });
        }

        return particles;
    }


    function moveParticles(
        particles,
        world,
        hours
    ) {

        if (
            !particles ||
            !world
        ) {

            return;
        }

        var duration =
            Number(
                hours
            );

        if (
            !isFinite(
                duration
            )
        ) {

            duration =
                1;
        }

        var i;

        for (
            i = 0;
            i <
            particles.length;
            i++
        ) {

            var particle =
                particles[i];

            var weather =
                world.sample(
                    particle.lat,
                    particle.lon
                );

            var speed =
                weather.wind.speedMs;

            if (
                speed <
                0.05
            ) {

                particle.age +=
                    duration;

                continue;
            }

            var latChange =
                (
                    weather.wind.vMs *
                    3600 *
                    duration
                ) /
                111000;

            var cosLat =
                Math.max(
                    0.25,
                    Math.cos(
                        particle.lat *
                        DEG
                    )
                );

            var lonChange =
                (
                    weather.wind.uMs *
                    3600 *
                    duration
                ) /
                (
                    111000 *
                    cosLat
                );

            particle.lat +=
                latChange;

            particle.lon +=
                lonChange;

            particle.age +=
                duration;

            /*
             * Respawn particles that leave map or become old.
             */
            if (
                particle.lat <
                SOUTH ||
                particle.lat >
                NORTH ||
                particle.lon <
                WEST ||
                particle.lon >
                EAST ||
                particle.age >
                96
            ) {

                particle.lat =
                    SOUTH +
                    hash(
                        i *
                        733 +
                        world.hoursElapsed *
                        13
                    ) *
                    (
                        NORTH -
                        SOUTH
                    );

                particle.lon =
                    WEST +
                    hash(
                        i *
                        971 +
                        world.hoursElapsed *
                        17
                    ) *
                    (
                        EAST -
                        WEST
                    );

                particle.age =
                    0;
            }
        }
    }


    /* ============================================================
       RUN CONTROL
    ============================================================ */

    function rerollWeather() {

        simulationSeed =
            randomSeed();

        return simulationSeed;
    }


    function setSimulationSeed(
        seed
    ) {

        var value =
            Math.floor(
                Number(
                    seed
                )
            );

        if (
            !isFinite(
                value
            ) ||
            value <=
            0
        ) {

            return simulationSeed;
        }

        simulationSeed =
            value;

        return simulationSeed;
    }


    function getSimulationSeed() {

        return simulationSeed;
    }


    function setClimatologicalMode(
        enabled
    ) {

        climatologicalMode =
            !!enabled;

        return climatologicalMode;
    }


    function getClimatologicalMode() {

        return climatologicalMode;
    }


    /* ============================================================
       PUBLIC API
    ============================================================ */

    window.EuropaWeather = {

        version:
            VERSION,

        bounds: {

            west:
                WEST,

            east:
                EAST,

            south:
                SOUTH,

            north:
                NORTH
        },

        grid: {

            width:
                WIDTH,

            height:
                HEIGHT,

            resolution:
                STEP,

            cells:
                CELL_COUNT
        },

        WeatherWorld:
            WeatherWorld,

        simulate:
            simulate,

        pressure:
            pressureAt,

        windAt:
            windAt,

        interpolatedNormals:
            interpolatedNormals,

        seaSurfaceTemperature:
            seaSurfaceTemperature,

        createParticles:
            createParticles,

        moveParticles:
            moveParticles,

        setSurfaceProvider:
            setSurfaceProvider,

        rerollWeather:
            rerollWeather,

        setSimulationSeed:
            setSimulationSeed,

        getSimulationSeed:
            getSimulationSeed,

        setClimatologicalMode:
            setClimatologicalMode,

        getClimatologicalMode:
            getClimatologicalMode
    };


    console.log(
        "EuropaCraft Stateful Weather Engine loaded:",
        VERSION,
        "seed:",
        simulationSeed,
        "atmospheric cells:",
        CELL_COUNT
    );

})();
