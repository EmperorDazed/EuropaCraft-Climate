(function () {
    "use strict";

    /*
    ============================================================
    EuropaCraft Stateful Weather Engine
    Version 6.1 OPTIMISED

    Atmospheric physics:
        195 × 110
        0.4 degree

    Main optimisations:
        - climate geography cached once
        - land/sea cached once
        - monthly climatology cached
        - no climate lookups inside hourly transport
        - pressure/wind calculated once per hour
        - cloud/precipitation calculated once per hour
        - direct array access available to renderer
        - particle movement uses nearest wind cell
        - multi-hour stepping renders only after completion

    Persistent fields:
        temperature anomaly
        moisture
        air-mass tracer

    ============================================================
    */


    var VERSION =
        "6.1-persistent-transport-optimised";


    /* ============================================================
       DOMAIN
    ============================================================ */

    var WEST = -26;
    var EAST = 52;
    var SOUTH = 30;
    var NORTH = 74;

    var STEP = 0.4;

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
        makeRandomSeed();

    var climatologicalMode =
        false;

    var surfaceProvider =
        null;


    function makeRandomSeed() {

        return (
            Math.floor(
                Math.random() *
                2147483646
            ) +
            1
        );
    }


    /* ============================================================
       HELPERS
    ============================================================ */

    function clamp(
        value,
        minimum,
        maximum
    ) {

        if (
            value <
            minimum
        ) {
            return minimum;
        }

        if (
            value >
            maximum
        ) {
            return maximum;
        }

        return value;
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
            (
                value -
                minimum
            ) /
            (
                maximum -
                minimum
            );

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
            date.getTime() /
            86400000
        );
    }


    function dayOfYear(
        date
    ) {

        var start =
            Date.UTC(
                date.getUTCFullYear(),
                0,
                0
            );

        var current =
            Date.UTC(
                date.getUTCFullYear(),
                date.getUTCMonth(),
                date.getUTCDate()
            );

        return Math.floor(
            (
                current -
                start
            ) /
            86400000
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


    function localSolarHour(
        longitude,
        date
    ) {

        var hour =
            date.getUTCHours() +
            date.getUTCMinutes() /
            60 +
            longitude /
            15;

        while (
            hour <
            0
        ) {
            hour += 24;
        }

        while (
            hour >=
            24
        ) {
            hour -= 24;
        }

        return hour;
    }


    /* ============================================================
       SEEDED RANDOMNESS
    ============================================================ */

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


    function valueNoise(
        longitude,
        latitude,
        salt,
        scale
    ) {

        var sx =
            longitude /
            scale;

        var sy =
            latitude /
            scale;

        var x0 =
            Math.floor(
                sx
            );

        var y0 =
            Math.floor(
                sy
            );

        var fx =
            fract(
                sx
            );

        var fy =
            fract(
                sy
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

        var temporal =
            Math.floor(
                dayNumber(
                    date
                ) /
                2
            );

        return (
            valueNoise(
                longitude,
                latitude,
                temporal + 17,
                8
            ) *
            0.55 +
            valueNoise(
                longitude,
                latitude,
                temporal + 103,
                3.2
            ) *
            0.30 +
            valueNoise(
                longitude,
                latitude,
                temporal + 317,
                1.4
            ) *
            0.15
        );
    }


    /* ============================================================
       TEMPERATURE CLIMATOLOGY ANCHORS
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


    /* ============================================================
       MONTH INTERPOLATION
    ============================================================ */

    function monthPosition(
        date
    ) {

        var month =
            date.getUTCMonth();

        var nextMonth =
            (
                month +
                1
            ) %
            12;

        var start =
            Date.UTC(
                date.getUTCFullYear(),
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
                    date.getUTCFullYear() + 1,
                    0,
                    1
                );

        } else {

            next =
                Date.UTC(
                    date.getUTCFullYear(),
                    month + 1,
                    1
                );
        }

        return {

            month:
                month,

            next:
                nextMonth,

            amount:
                clamp(
                    (
                        date.getTime() -
                        start
                    ) /
                    (
                        next -
                        start
                    ),
                    0,
                    1
                )
        };
    }


    /* ============================================================
       CLIMATE ACCESS
    ============================================================ */

    function getClimate(
        latitude,
        longitude,
        landFraction
    ) {

        if (
            !window.EuropaClimate ||
            typeof window.EuropaClimate.getIndices !==
                "function"
        ) {

            return null;
        }

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
       SURFACE PROVIDER
    ============================================================ */

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


    function getLandFraction(
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

        return 1;
    }


    /* ============================================================
       SYNOPTIC SYSTEMS
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


    function createSynopticSystems(
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

        var i;

        for (
            i = 0;
            i < 3;
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

            systems.push({

                type:
                    0,

                lat:
                    latitude,

                lon:
                    lerp(
                        startLon,
                        endLon,
                        progress
                    ) +
                    i *
                    12,

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

        systems.push({

            type:
                1,

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


    function pressureFromSystems(
        latitude,
        longitude,
        date,
        systems
    ) {

        if (
            climatologicalMode
        ) {

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

        var cosLatitude =
            Math.cos(
                latitude *
                DEG
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
                cosLatitude;

            var distanceSquared =
                dx *
                dx +
                dy *
                dy;

            var radiusSquared =
                system.radius *
                system.radius;

            var influence =
                Math.exp(
                    -distanceSquared /
                    (
                        2 *
                        radiusSquared
                    )
                );

            if (
                system.type ===
                0
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

        pressure +=
            (
                atmosphericNoise(
                    longitude,
                    latitude,
                    date
                ) -
                0.5
            ) *
            2.5;

        return pressure;
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
            x | 0;

        var y0 =
            y | 0;

        var x1 =
            x0 + 1;

        var y1 =
            y0 + 1;

        if (
            x1 >=
            WIDTH
        ) {
            x1 =
                WIDTH -
                1;
        }

        if (
            y1 >=
            HEIGHT
        ) {
            y1 =
                HEIGHT -
                1;
        }

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

        return (
            a *
            (
                1 -
                fx
            ) *
            (
                1 -
                fy
            ) +
            b *
            fx *
            (
                1 -
                fy
            ) +
            c *
            (
                1 -
                fx
            ) *
            fy +
            d *
            fx *
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

        this.hoursElapsed =
            0;

        this.lastClimatologyDay =
            -1;


        /* STATIC GEOGRAPHY */

        this.latitude =
            new Float32Array(
                CELL_COUNT
            );

        this.longitude =
            new Float32Array(
                CELL_COUNT
            );

        this.landFraction =
            new Float32Array(
                CELL_COUNT
            );

        this.maritime =
            new Float32Array(
                CELL_COUNT
            );

        this.continental =
            new Float32Array(
                CELL_COUNT
            );


        /* SEA WEIGHTS */

        this.wAtlantic =
            new Float32Array(
                CELL_COUNT
            );

        this.wNorthSea =
            new Float32Array(
                CELL_COUNT
            );

        this.wBaltic =
            new Float32Array(
                CELL_COUNT
            );

        this.wMediterranean =
            new Float32Array(
                CELL_COUNT
            );

        this.wBlackSea =
            new Float32Array(
                CELL_COUNT
            );

        this.wCaspian =
            new Float32Array(
                CELL_COUNT
            );


        /* MONTHLY CLIMATOLOGY */

        this.monthlyHigh =
            new Float32Array(
                CELL_COUNT *
                12
            );

        this.monthlyLow =
            new Float32Array(
                CELL_COUNT *
                12
            );

        this.normalHigh =
            new Float32Array(
                CELL_COUNT
            );

        this.normalLow =
            new Float32Array(
                CELL_COUNT
            );


        /* DYNAMIC ATMOSPHERE */

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

        this.airMass =
            new Float32Array(
                CELL_COUNT
            );

        this.sst =
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

        this.windSpeed =
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


        /* TRANSPORT SCRATCH */

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


        this.buildStaticGeography();
        this.buildMonthlyClimatology();
        this.updateDailyClimatology();
        this.initializeAtmosphere();
    }


    /* ============================================================
       STATIC GEOGRAPHY CACHE
    ============================================================ */

    WeatherWorld.prototype.buildStaticGeography =
        function () {

            var x;
            var y;

            for (
                y = 0;
                y < HEIGHT;
                y++
            ) {

                var lat =
                    latitudeForY(
                        y
                    );

                for (
                    x = 0;
                    x < WIDTH;
                    x++
                ) {

                    var lon =
                        longitudeForX(
                            x
                        );

                    var index =
                        indexOf(
                            x,
                            y
                        );

                    this.latitude[
                        index
                    ] =
                        lat;

                    this.longitude[
                        index
                    ] =
                        lon;

                    var land =
                        getLandFraction(
                            lat,
                            lon
                        );

                    this.landFraction[
                        index
                    ] =
                        land;

                    var climate =
                        getClimate(
                            lat,
                            lon,
                            land
                        );

                    this.maritime[
                        index
                    ] =
                        climateIndex(
                            climate,
                            "maritime"
                        );

                    this.continental[
                        index
                    ] =
                        climateIndex(
                            climate,
                            "continental"
                        );

                    this.wAtlantic[
                        index
                    ] =
                        climateWeight(
                            climate,
                            "Atlantic"
                        ) +
                        climateWeight(
                            climate,
                            "Polar Maritime"
                        );

                    this.wNorthSea[
                        index
                    ] =
                        climateWeight(
                            climate,
                            "North Sea"
                        );

                    this.wBaltic[
                        index
                    ] =
                        climateWeight(
                            climate,
                            "Baltic Maritime"
                        );

                    this.wMediterranean[
                        index
                    ] =
                        climateWeight(
                            climate,
                            "Mediterranean"
                        );

                    this.wBlackSea[
                        index
                    ] =
                        climateWeight(
                            climate,
                            "Black Sea"
                        );

                    this.wCaspian[
                        index
                    ] =
                        climateWeight(
                            climate,
                            "Caspian Maritime"
                        );
                }
            }
        };


    /* ============================================================
       MONTHLY CLIMATOLOGY CACHE
    ============================================================ */

    WeatherWorld.prototype.buildMonthlyClimatology =
        function () {

            var index;
            var month;
            var anchorIndex;

            for (
                index = 0;
                index <
                CELL_COUNT;
                index++
            ) {

                var lat =
                    this.latitude[
                        index
                    ];

                var lon =
                    this.longitude[
                        index
                    ];

                var cosLat =
                    Math.cos(
                        lat *
                        DEG
                    );

                var weights =
                    [];

                var totalWeight =
                    0;

                for (
                    anchorIndex = 0;
                    anchorIndex <
                    TEMP_ANCHORS.length;
                    anchorIndex++
                ) {

                    var anchor =
                        TEMP_ANCHORS[
                            anchorIndex
                        ];

                    var dy =
                        lat -
                        anchor.lat;

                    var dx =
                        (
                            lon -
                            anchor.lon
                        ) *
                        cosLat;

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
                        weight *= 3;
                    }

                    weights[
                        anchorIndex
                    ] =
                        weight;

                    totalWeight +=
                        weight;
                }

                for (
                    month = 0;
                    month < 12;
                    month++
                ) {

                    var high =
                        0;

                    var low =
                        0;

                    for (
                        anchorIndex = 0;
                        anchorIndex <
                        TEMP_ANCHORS.length;
                        anchorIndex++
                    ) {

                        var a =
                            TEMP_ANCHORS[
                                anchorIndex
                            ];

                        var w =
                            weights[
                                anchorIndex
                            ];

                        high +=
                            a.high[
                                month
                            ] *
                            w;

                        low +=
                            a.low[
                                month
                            ] *
                            w;
                    }

                    high /=
                        totalWeight;

                    low /=
                        totalWeight;


                    /* CLIMATE CORRECTIONS */

                    var maritime =
                        this.maritime[
                            index
                        ];

                    var continental =
                        this.continental[
                            index
                        ];

                    var seasonal =
                        Math.cos(
                            TWO_PI *
                            (
                                month -
                                6
                            ) /
                            12
                        );

                    if (
                        seasonal >
                        0
                    ) {

                        high +=
                            continental *
                            seasonal *
                            0.8;

                        low -=
                            continental *
                            seasonal *
                            0.5;

                        high -=
                            maritime *
                            seasonal *
                            0.4;

                    } else {

                        var winter =
                            -seasonal;

                        high -=
                            continental *
                            winter *
                            0.6;

                        low -=
                            continental *
                            winter *
                            1.1;

                        low +=
                            maritime *
                            winter *
                            0.6;
                    }

                    this.monthlyHigh[
                        index *
                        12 +
                        month
                    ] =
                        high;

                    this.monthlyLow[
                        index *
                        12 +
                        month
                    ] =
                        low;
                }
            }
        };


    /* ============================================================
       DAILY CLIMATOLOGY
    ============================================================ */

    WeatherWorld.prototype.updateDailyClimatology =
        function () {

            var dayKey =
                this.date.getUTCFullYear() *
                1000 +
                dayOfYear(
                    this.date
                );

            if (
                dayKey ===
                this.lastClimatologyDay
            ) {

                return;
            }

            this.lastClimatologyDay =
                dayKey;

            var monthInfo =
                monthPosition(
                    this.date
                );

            var index;

            for (
                index = 0;
                index <
                CELL_COUNT;
                index++
            ) {

                var offset =
                    index *
                    12;

                this.normalHigh[
                    index
                ] =
                    lerp(
                        this.monthlyHigh[
                            offset +
                            monthInfo.month
                        ],
                        this.monthlyHigh[
                            offset +
                            monthInfo.next
                        ],
                        monthInfo.amount
                    );

                this.normalLow[
                    index
                ] =
                    lerp(
                        this.monthlyLow[
                            offset +
                            monthInfo.month
                        ],
                        this.monthlyLow[
                            offset +
                            monthInfo.next
                        ],
                        monthInfo.amount
                    );
            }
        };


    /* ============================================================
       CLIMATOLOGICAL TEMPERATURE FOR CELL
    ============================================================ */

    WeatherWorld.prototype.normalTemperatureForCell =
        function (
            index
        ) {

            var high =
                this.normalHigh[
                    index
                ];

            var low =
                this.normalLow[
                    index
                ];

            var mean =
                (
                    high +
                    low
                ) *
                0.5;

            var range =
                high -
                low;

            range *=
                clamp(
                    1 -
                    this.maritime[
                        index
                    ] *
                    0.22,
                    0.70,
                    1
                );

            range *=
                (
                    1 +
                    this.continental[
                        index
                    ] *
                    0.12
                );

            var land =
                this.landFraction[
                    index
                ];

            if (
                land <
                0.5
            ) {

                range *=
                    lerp(
                        0.22,
                        1,
                        land *
                        2
                    );
            }

            var hour =
                localSolarHour(
                    this.longitude[
                        index
                    ],
                    this.date
                );

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
                range *
                0.5
            );
        };


    /* ============================================================
       SST FOR CELL
    ============================================================ */

    WeatherWorld.prototype.sstForCell =
        function (
            index
        ) {

            var latitude =
                this.latitude[
                    index
                ];

            var phase =
                Math.cos(
                    TWO_PI *
                    (
                        dayOfYear(
                            this.date
                        ) -
                        238
                    ) /
                    365.2422
                );

            var atlantic =
                this.wAtlantic[
                    index
                ];

            var northSea =
                this.wNorthSea[
                    index
                ];

            var baltic =
                this.wBaltic[
                    index
                ];

            var mediterranean =
                this.wMediterranean[
                    index
                ];

            var blackSea =
                this.wBlackSea[
                    index
                ];

            var caspian =
                this.wCaspian[
                    index
                ];

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

            return (
                atlantic *
                (
                    atlanticMean +
                    atlanticAmplitude *
                    phase
                ) +

                northSea *
                (
                    10.7 +
                    5.9 *
                    phase
                ) +

                baltic *
                (
                    8.0 +
                    9.2 *
                    phase
                ) +

                mediterranean *
                (
                    19.0 +
                    6.5 *
                    phase
                ) +

                blackSea *
                (
                    13.5 +
                    9.5 *
                    phase
                ) +

                caspian *
                (
                    13.0 +
                    10.5 *
                    phase
                )
            ) /
            total;
        };


    /* ============================================================
       INITIAL ATMOSPHERE
    ============================================================ */

    WeatherWorld.prototype.initializeAtmosphere =
        function () {

            var index;

            var doy =
                dayOfYear(
                    this.date
                );

            var winterContrast =
                Math.abs(
                    Math.cos(
                        TWO_PI *
                        (
                            doy -
                            15
                        ) /
                        365.2422
                    )
                );

            var anomalyAmplitude =
                2.3 +
                winterContrast *
                2.0;

            for (
                index = 0;
                index <
                CELL_COUNT;
                index++
            ) {

                var lat =
                    this.latitude[
                        index
                    ];

                var lon =
                    this.longitude[
                        index
                    ];

                var noise =
                    atmosphericNoise(
                        lon,
                        lat,
                        this.date
                    );

                var anomaly =
                    (
                        noise -
                        0.5
                    ) *
                    anomalyAmplitude *
                    2;

                if (
                    climatologicalMode
                ) {
                    anomaly = 0;
                }

                anomaly =
                    clamp(
                        anomaly,
                        -6,
                        6
                    );

                this.temperatureAnomaly[
                    index
                ] =
                    anomaly;

                this.sst[
                    index
                ] =
                    this.sstForCell(
                        index
                    );

                this.temperature[
                    index
                ] =
                    this.normalTemperatureForCell(
                        index
                    ) +
                    anomaly;

                this.moisture[
                    index
                ] =
                    clamp(
                        0.37 +
                        this.maritime[
                            index
                        ] *
                        0.28 +
                        (
                            1 -
                            this.landFraction[
                                index
                            ]
                        ) *
                        0.18 +
                        (
                            noise -
                            0.5
                        ) *
                        0.10,
                        0.10,
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

            this.updatePressureAndWind();
            this.updateCloudAndPrecipitation();
        };


    /* ============================================================
       PRESSURE AND WIND — ONCE PER HOUR
    ============================================================ */

    WeatherWorld.prototype.updatePressureAndWind =
        function () {

            var systems =
                createSynopticSystems(
                    this.date
                );

            var index;

            for (
                index = 0;
                index <
                CELL_COUNT;
                index++
            ) {

                this.pressure[
                    index
                ] =
                    pressureFromSystems(
                        this.latitude[
                            index
                        ],
                        this.longitude[
                            index
                        ],
                        this.date,
                        systems
                    );
            }


            var x;
            var y;

            for (
                y = 0;
                y < HEIGHT;
                y++
            ) {

                var lat =
                    latitudeForY(
                        y
                    );

                var background =
                    2.2 *
                    smoothstep(
                        35,
                        48,
                        lat
                    ) *
                    (
                        1 -
                        smoothstep(
                            70,
                            75,
                            lat
                        )
                    );

                for (
                    x = 0;
                    x < WIDTH;
                    x++
                ) {

                    var index =
                        indexOf(
                            x,
                            y
                        );

                    var xWest =
                        x > 0
                            ? x - 1
                            : x;

                    var xEast =
                        x <
                        WIDTH - 1
                            ? x + 1
                            : x;

                    var yNorth =
                        y > 0
                            ? y - 1
                            : y;

                    var ySouth =
                        y <
                        HEIGHT - 1
                            ? y + 1
                            : y;

                    var dpdx =
                        (
                            this.pressure[
                                indexOf(
                                    xEast,
                                    y
                                )
                            ] -
                            this.pressure[
                                indexOf(
                                    xWest,
                                    y
                                )
                            ]
                        ) /
                        (
                            (
                                xEast -
                                xWest
                            ) *
                            STEP ||
                            STEP
                        );

                    var dpdy =
                        (
                            this.pressure[
                                indexOf(
                                    x,
                                    yNorth
                                )
                            ] -
                            this.pressure[
                                indexOf(
                                    x,
                                    ySouth
                                )
                            ]
                        ) /
                        (
                            (
                                ySouth -
                                yNorth
                            ) *
                            STEP ||
                            STEP
                        );

                    var u =
                        -dpdy *
                        9.0 +
                        background;

                    var v =
                        dpdx *
                        9.0;

                    if (
                        !climatologicalMode
                    ) {

                        var variation =
                            atmosphericNoise(
                                this.longitude[
                                    index
                                ],
                                this.latitude[
                                    index
                                ],
                                this.date
                            ) -
                            0.5;

                        u +=
                            variation *
                            0.8;

                        v +=
                            variation *
                            0.45;
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
                        28
                    ) {

                        var scale =
                            28 /
                            speed;

                        u *=
                            scale;

                        v *=
                            scale;

                        speed =
                            28;
                    }

                    this.windU[
                        index
                    ] =
                        u;

                    this.windV[
                        index
                    ] =
                        v;

                    this.windSpeed[
                        index
                    ] =
                        speed;
                }
            }
        };


    /* ============================================================
       CLOUD AND PRECIPITATION — ONCE PER HOUR
    ============================================================ */

    WeatherWorld.prototype.updateCloudAndPrecipitation =
        function () {

            var x;
            var y;

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

                    var index =
                        indexOf(
                            x,
                            y
                        );

                    var xWest =
                        x > 0
                            ? x - 1
                            : x;

                    var xEast =
                        x <
                        WIDTH - 1
                            ? x + 1
                            : x;

                    var yNorth =
                        y > 0
                            ? y - 1
                            : y;

                    var ySouth =
                        y <
                        HEIGHT - 1
                            ? y + 1
                            : y;

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
                                    index
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
                                    index
                                ] -
                                this.temperature[
                                    index
                                ] -
                                1
                            ) /
                            9,
                            0,
                            1
                        );

                    var moisture =
                        this.moisture[
                            index
                        ];

                    var saturation =
                        smoothstep(
                            0.48,
                            0.78,
                            moisture
                        );

                    var cloud =
                        saturation *
                        0.48;

                    cloud +=
                        lowLift *
                        moisture *
                        0.42;

                    cloud +=
                        convergence *
                        moisture *
                        0.68;

                    cloud +=
                        seaInstability *
                        (
                            1 -
                            this.landFraction[
                                index
                            ]
                        ) *
                        moisture *
                        0.40;

                    var noise =
                        atmosphericNoise(
                            this.longitude[
                                index
                            ],
                            this.latitude[
                                index
                            ],
                            this.date
                        );

                    cloud *=
                        0.90 +
                        noise *
                        0.16;

                    if (
                        this.pressure[
                            index
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
                        index
                    ] =
                        cloud;


                    var lift =
                        convergence;

                    if (
                        lowLift *
                        0.72 >
                        lift
                    ) {

                        lift =
                            lowLift *
                            0.72;
                    }

                    var showerLift =
                        seaInstability *
                        (
                            1 -
                            this.landFraction[
                                index
                            ]
                        ) *
                        0.60;

                    if (
                        showerLift >
                        lift
                    ) {

                        lift =
                            showerLift;
                    }

                    var potential =
                        moisture *
                        cloud *
                        (
                            0.28 +
                            lift
                        );

                    var precipitation =
                        smoothstep(
                            0.15,
                            0.47,
                            potential
                        );

                    if (
                        lowLift >
                        0.35 &&
                        cloud >
                        0.60 &&
                        moisture >
                        0.55
                    ) {

                        precipitation =
                            Math.max(
                                precipitation,
                                lowLift *
                                cloud *
                                0.52
                            );
                    }

                    this.precipitation[
                        index
                    ] =
                        clamp(
                            precipitation,
                            0,
                            1
                        );
                }
            }
        };


    /* ============================================================
       ONE-HOUR TRANSPORT
    ============================================================ */

    WeatherWorld.prototype.stepOneHour =
        function () {

            var index;

            /*
             * Pressure/wind for current hour.
             */
            this.updatePressureAndWind();


            /* ====================================================
               TRANSPORT
            ==================================================== */

            for (
                index = 0;
                index <
                CELL_COUNT;
                index++
            ) {

                var lat =
                    this.latitude[
                        index
                    ];

                var lon =
                    this.longitude[
                        index
                    ];

                var u =
                    this.windU[
                        index
                    ];

                var v =
                    this.windV[
                        index
                    ];

                var cosLat =
                    Math.max(
                        0.25,
                        Math.cos(
                            lat *
                            DEG
                        )
                    );

                var sourceLat =
                    lat -
                    (
                        v *
                        3600 /
                        111000
                    );

                var sourceLon =
                    lon -
                    (
                        u *
                        3600 /
                        (
                            111000 *
                            cosLat
                        )
                    );

                var sourceX =
                    gridX(
                        sourceLon
                    );

                var sourceY =
                    gridY(
                        sourceLat
                    );

                var anomaly =
                    sampleArray(
                        this.temperatureAnomaly,
                        sourceX,
                        sourceY
                    );

                var moisture =
                    sampleArray(
                        this.moisture,
                        sourceX,
                        sourceY
                    );

                var airMass =
                    sampleArray(
                        this.airMass,
                        sourceX,
                        sourceY
                    );


                if (
                    climatologicalMode
                ) {

                    anomaly =
                        0;

                } else {

                    /*
                     * Slow anomaly decay.
                     *
                     * Air mass persists for days rather
                     * than disappearing in hours.
                     */
                    anomaly *=
                        0.994;

                    var land =
                        this.landFraction[
                            index
                        ];

                    if (
                        land <
                        0.45
                    ) {

                        var currentAir =
                            this.normalTemperatureForCell(
                                index
                            ) +
                            anomaly;

                        var difference =
                            this.sst[
                                index
                            ] -
                            currentAir;

                        anomaly +=
                            difference *
                            (
                                0.012 +
                                (
                                    1 -
                                    land
                                ) *
                                0.022
                            );
                    }

                    /*
                     * Clear calm continental nights.
                     */
                    var hour =
                        localSolarHour(
                            lon,
                            this.date
                        );

                    var night =
                        (
                            hour >=
                            18 ||
                            hour <
                            7
                        );

                    if (
                        night &&
                        land >
                        0.65 &&
                        this.cloud[
                            index
                        ] <
                        0.30 &&
                        this.windSpeed[
                            index
                        ] <
                        3
                    ) {

                        anomaly -=
                            0.025;
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
                            0.014;
                    }
                }


                /* =================================================
                   MOISTURE
                ================================================= */

                var localLand =
                    this.landFraction[
                        index
                    ];

                if (
                    localLand <
                    0.45
                ) {

                    moisture +=
                        (
                            0.0035 +
                            (
                                1 -
                                localLand
                            ) *
                            0.007
                        ) *
                        clamp(
                            0.7 +
                            this.windSpeed[
                                index
                            ] /
                            10,
                            0.7,
                            1.8
                        );
                }

                if (
                    localLand >
                    0.60
                ) {

                    moisture -=
                        0.0018;
                }

                moisture -=
                    this.precipitation[
                        index
                    ] *
                    0.015;

                moisture =
                    clamp(
                        moisture,
                        0.05,
                        1
                    );


                airMass =
                    lerp(
                        airMass,
                        clamp(
                            anomaly /
                            7,
                            -1,
                            1
                        ),
                        0.012
                    );


                this.nextAnomaly[
                    index
                ] =
                    clamp(
                        anomaly,
                        -9,
                        9
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


            /* SWAP BUFFERS */

            var swap;

            swap =
                this.temperatureAnomaly;

            this.temperatureAnomaly =
                this.nextAnomaly;

            this.nextAnomaly =
                swap;


            swap =
                this.moisture;

            this.moisture =
                this.nextMoisture;

            this.nextMoisture =
                swap;


            swap =
                this.airMass;

            this.airMass =
                this.nextAirMass;

            this.nextAirMass =
                swap;


            /* ADVANCE TIME */

            this.date =
                new Date(
                    this.date.getTime() +
                    3600000
                );

            this.hoursElapsed++;


            this.updateDailyClimatology();


            /* ACTUAL TEMPERATURE */

            for (
                index = 0;
                index <
                CELL_COUNT;
                index++
            ) {

                this.sst[
                    index
                ] =
                    this.sstForCell(
                        index
                    );

                this.temperature[
                    index
                ] =
                    this.normalTemperatureForCell(
                        index
                    ) +
                    this.temperatureAnomaly[
                        index
                    ];
            }


            /*
             * New pressure/wind for new hour.
             */
            this.updatePressureAndWind();

            /*
             * Cloud/precip once.
             */
            this.updateCloudAndPrecipitation();
        };


    /* ============================================================
       MULTI-HOUR STEP
    ============================================================ */

    WeatherWorld.prototype.step =
        function (
            hours
        ) {

            var count =
                Math.floor(
                    Number(
                        hours
                    )
                );

            if (
                !isFinite(
                    count
                ) ||
                count <
                1
            ) {

                count = 1;
            }

            var i;

            for (
                i = 0;
                i < count;
                i++
            ) {

                this.stepOneHour();
            }
        };


    /* ============================================================
       DIRECT CELL ACCESS
    ============================================================ */

    WeatherWorld.prototype.nearestCell =
        function (
            latitude,
            longitude
        ) {

            var x =
                Math.round(
                    gridX(
                        longitude
                    )
                );

            var y =
                Math.round(
                    gridY(
                        latitude
                    )
                );

            x =
                clamp(
                    x,
                    0,
                    WIDTH - 1
                );

            y =
                clamp(
                    y,
                    0,
                    HEIGHT - 1
                );

            return indexOf(
                x,
                y
            );
        };


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

            var precipitation =
                sampleArray(
                    this.precipitation,
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
                    u *
                    u +
                    v *
                    v
                );

            var precipitationType =
                "dry";

            if (
                precipitation >
                0.04
            ) {

                if (
                    temperature <=
                    1.5
                ) {

                    precipitationType =
                        "snow";

                } else if (
                    temperature <=
                    3
                ) {

                    precipitationType =
                        "sleet";

                } else {

                    precipitationType =
                        "rain";
                }
            }

            return {

                date:
                    this.date.toISOString(),

                simulationSeed:
                    simulationSeed,

                temperatureC:
                    temperature,

                temperatureAnomalyC:
                    sampleArray(
                        this.temperatureAnomaly,
                        x,
                        y
                    ),

                seaSurfaceTemperatureC:
                    sampleArray(
                        this.sst,
                        x,
                        y
                    ),

                moisture:
                    sampleArray(
                        this.moisture,
                        x,
                        y
                    ),

                pressureHpa:
                    sampleArray(
                        this.pressure,
                        x,
                        y
                    ),

                cloudFraction:
                    sampleArray(
                        this.cloud,
                        x,
                        y
                    ),

                precipitationIntensity:
                    precipitation,

                precipitationType:
                    precipitationType,

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
                        (
                            Math.atan2(
                                -u,
                                -v
                            ) /
                            DEG +
                            360
                        ) %
                        360
                }
            };
        };


    /* ============================================================
       PARTICLES
    ============================================================ */

    function createParticles(
        count
    ) {

        var result =
            [];

        var total =
            Math.floor(
                Number(
                    count
                )
            );

        if (
            !isFinite(
                total
            )
        ) {
            total = 300;
        }

        total =
            clamp(
                total,
                20,
                1000
            );

        var i;

        for (
            i = 0;
            i < total;
            i++
        ) {

            result.push({

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
                    hash(
                        i *
                        617 +
                        43
                    ) *
                    72
            });
        }

        return result;
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
            duration = 1;
        }

        var i;

        for (
            i = 0;
            i <
            particles.length;
            i++
        ) {

            var particle =
                particles[
                    i
                ];

            var cell =
                world.nearestCell(
                    particle.lat,
                    particle.lon
                );

            var u =
                world.windU[
                    cell
                ];

            var v =
                world.windV[
                    cell
                ];

            var cosLat =
                Math.max(
                    0.25,
                    Math.cos(
                        particle.lat *
                        DEG
                    )
                );

            particle.lat +=
                (
                    v *
                    3600 *
                    duration
                ) /
                111000;

            particle.lon +=
                (
                    u *
                    3600 *
                    duration
                ) /
                (
                    111000 *
                    cosLat
                );

            particle.age +=
                duration;

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
       LEGACY SINGLE-CELL API
    ============================================================ */

    function simulate(
        latitude,
        longitude,
        date
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
       SEED AND MODE
    ============================================================ */

    function rerollWeather() {

        simulationSeed =
            makeRandomSeed();

        return simulationSeed;
    }


    function setSimulationSeed(
        seed
    ) {

        var number =
            Math.floor(
                Number(
                    seed
                )
            );

        if (
            !isFinite(
                number
            ) ||
            number <
            1
        ) {

            return simulationSeed;
        }

        simulationSeed =
            number;

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
        "EuropaCraft Weather Engine:",
        VERSION,
        "seed:",
        simulationSeed,
        "grid:",
        WIDTH +
        "x" +
        HEIGHT
    );

})();
