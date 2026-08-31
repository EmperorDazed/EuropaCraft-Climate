(function () {
    "use strict";

    /* =========================================================
       EuropaCraft Weather Engine
       Version 3.0

       Designed for:
       26 W to 52 E
       30 N to 74 N

       Requires:
       window.EuropaClimate.getIndices()

       Public API preserved:
       EuropaWeather.pressure()
       EuropaWeather.pressureGradient()
       EuropaWeather.windAt()
       EuropaWeather.simulate()
    ========================================================= */

    var DEG = Math.PI / 180;
    var TWO_PI = Math.PI * 2;


    /* =========================================================
       BASIC HELPERS
    ========================================================= */

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function smoothstep(a, b, x) {
        var t;

        if (a === b) {
            return x < a ? 0 : 1;
        }

        t = clamp((x - a) / (b - a), 0, 1);

        return t * t * (3 - 2 * t);
    }

    function validDate(date) {
        var d;

        if (date instanceof Date) {
            d = date;
        } else {
            d = new Date(date);
        }

        if (isNaN(d.getTime())) {
            d = new Date();
        }

        return d;
    }

    function dayNumber(date) {
        return validDate(date).getTime() / 86400000;
    }

    function dayOfYear(date) {
        var d = validDate(date);

        var start = Date.UTC(
            d.getUTCFullYear(),
            0,
            0
        );

        var current = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate()
        );

        return Math.floor(
            (current - start) /
            86400000
        );
    }

    function fract(x) {
        return x - Math.floor(x);
    }

    function hash2(x, y, seed) {
        var n =
            Math.sin(
                x * 12.9898 +
                y * 78.233 +
                seed * 37.719
            ) *
            43758.5453;

        return fract(n);
    }

    function distanceApprox(lat1, lon1, lat2, lon2) {
        var meanLat =
            (lat1 + lat2) *
            0.5 *
            DEG;

        var dy =
            lat1 -
            lat2;

        var dx =
            (lon1 - lon2) *
            Math.cos(meanLat);

        return Math.sqrt(
            dx * dx +
            dy * dy
        );
    }


    /* =========================================================
       MONTHLY TEMPERATURE NORMALS

       Arrays are:
       Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec

       They are representative lowland anchors rather than
       absolute city simulations.

       high = average daily maximum
       low  = average daily minimum
    ========================================================= */

    var TEMP_ANCHORS = [

        {
            name: "South East England",
            lat: 51.5,
            lon: -0.5,
            high: [8, 9, 11, 15, 18, 21, 23, 23, 20, 16, 11, 8],
            low:  [3, 3, 4, 6, 9, 12, 14, 14, 11, 8, 5, 3]
        },

        {
            name: "Northern England",
            lat: 54.5,
            lon: -2.0,
            high: [7, 8, 10, 13, 16, 19, 21, 20, 17, 13, 9, 7],
            low:  [2, 2, 3, 5, 8, 11, 13, 12, 10, 7, 4, 2]
        },

        {
            name: "Scotland",
            lat: 56.5,
            lon: -4.0,
            high: [6, 7, 9, 12, 15, 17, 19, 18, 16, 12, 8, 6],
            low:  [1, 1, 2, 4, 7, 9, 11, 11, 9, 6, 3, 1]
        },

        {
            name: "Ireland",
            lat: 53.3,
            lon: -8.0,
            high: [8, 9, 11, 13, 16, 18, 20, 20, 18, 14, 10, 8],
            low:  [3, 3, 4, 5, 8, 10, 12, 12, 10, 7, 5, 3]
        },

        {
            name: "Atlantic France",
            lat: 47.5,
            lon: -2.0,
            high: [10, 11, 14, 16, 20, 23, 25, 25, 22, 18, 13, 10],
            low:  [4, 4, 6, 8, 11, 14, 16, 16, 13, 10, 6, 4]
        },

        {
            name: "Central France",
            lat: 47.0,
            lon: 2.5,
            high: [7, 9, 13, 17, 21, 25, 27, 27, 23, 17, 11, 8],
            low:  [1, 1, 4, 6, 10, 13, 15, 15, 11, 8, 4, 2]
        },

        {
            name: "Berlin",
            lat: 52.5,
            lon: 13.4,
            high: [3, 6, 9, 15, 20, 23, 25, 24, 20, 14, 8, 4],
            low:  [-1, 0, 1, 5, 9, 13, 15, 14, 11, 7, 3, 0]
        },

        {
            name: "Warsaw",
            lat: 52.2,
            lon: 21.0,
            high: [1.0, 2.6, 7.4, 14.6, 19.8, 23.1, 25.2, 24.7, 19.1, 12.9, 6.5, 2.3],
            low:  [-4.0, -3.3, -0.6, 4.0, 8.8, 12.4, 14.5, 13.8, 9.5, 5.0, 1.3, -2.5]
        },

        {
            name: "Pomerania",
            lat: 54.2,
            lon: 18.0,
            high: [2, 3, 7, 12, 17, 20, 22, 22, 18, 12, 7, 3],
            low:  [-2, -2, 0, 4, 8, 11, 14, 14, 10, 6, 2, -1]
        },

        {
            name: "Baltic States",
            lat: 56.5,
            lon: 24.0,
            high: [-1, 0, 5, 12, 18, 21, 24, 23, 17, 10, 4, 0],
            low:  [-6, -6, -2, 3, 8, 12, 15, 14, 9, 4, 0, -4]
        },

        {
            name: "Helsinki",
            lat: 60.2,
            lon: 24.9,
            high: [-2, -2, 2, 9, 16, 20, 23, 21, 16, 9, 3, 0],
            low:  [-7, -8, -5, 0, 5, 10, 13, 12, 8, 3, -1, -5]
        },

        {
            name: "Stockholm",
            lat: 59.3,
            lon: 18.1,
            high: [1, 1, 5, 11, 17, 21, 23, 22, 17, 11, 6, 2],
            low:  [-4, -4, -2, 2, 6, 11, 14, 13, 9, 4, 1, -3]
        },

        {
            name: "Oslo",
            lat: 59.9,
            lon: 10.7,
            high: [-1, 0, 5, 11, 17, 21, 22, 21, 16, 9, 3, 0],
            low:  [-6, -6, -3, 1, 6, 10, 14, 12, 8, 3, -1, -5]
        },

        {
            name: "Western Norway",
            lat: 61.0,
            lon: 5.5,
            high: [5, 5, 7, 10, 14, 17, 19, 19, 16, 11, 7, 5],
            low:  [1, 1, 2, 4, 7, 10, 12, 12, 9, 6, 3, 1]
        },

        {
            name: "Northern Scandinavia",
            lat: 68.0,
            lon: 20.0,
            high: [-8, -7, -2, 4, 10, 15, 18, 16, 10, 3, -3, -7],
            low:  [-16, -15, -11, -5, 1, 6, 9, 7, 2, -4, -10, -14]
        },

        {
            name: "Moscow",
            lat: 55.8,
            lon: 37.6,
            high: [-6.3, -4.2, 1.5, 10.4, 18.4, 21.7, 23.1, 21.5, 15.4, 8.2, 1.1, -3.5],
            low:  [-12.3, -11.1, -5.6, 1.7, 7.6, 11.5, 13.5, 12.0, 7.1, 2.1, -3.3, -8.6]
        },

        {
            name: "Ukraine",
            lat: 49.5,
            lon: 31.0,
            high: [-2, 0, 6, 15, 21, 25, 27, 27, 21, 13, 5, 0],
            low:  [-8, -7, -2, 5, 10, 14, 16, 15, 10, 5, 0, -5]
        },

        {
            name: "Hungarian Basin",
            lat: 47.2,
            lon: 19.3,
            high: [3, 6, 11, 17, 22, 26, 28, 28, 23, 17, 10, 4],
            low:  [-2, -1, 3, 7, 11, 15, 17, 16, 12, 7, 3, -1]
        },

        {
            name: "Bucharest",
            lat: 44.4,
            lon: 26.1,
            high: [3, 6, 12, 19, 24, 28, 30, 30, 25, 18, 10, 4],
            low:  [-5, -4, 0, 5, 10, 14, 16, 15, 11, 6, 1, -3]
        },

        {
            name: "Dalmatia",
            lat: 43.5,
            lon: 16.4,
            high: [11, 12, 15, 19, 24, 28, 31, 31, 26, 21, 16, 12],
            low:  [5, 6, 8, 11, 15, 19, 22, 22, 18, 14, 10, 6]
        },

        {
            name: "Po Valley",
            lat: 45.2,
            lon: 9.5,
            high: [7, 10, 14, 18, 23, 27, 30, 29, 24, 18, 12, 8],
            low:  [0, 2, 5, 9, 13, 17, 19, 18, 14, 10, 5, 1]
        },

        {
            name: "Rome",
            lat: 41.9,
            lon: 12.5,
            high: [13, 14, 17, 20, 24, 28, 30, 30, 27, 22, 17, 14],
            low:  [4, 4, 7, 10, 14, 18, 20, 20, 17, 13, 9, 5]
        },

        {
            name: "Athens",
            lat: 38.0,
            lon: 23.7,
            high: [12, 13, 16, 21, 26, 31, 33, 33, 29, 23, 18, 14],
            low:  [5, 6, 8, 12, 16, 21, 22, 22, 19, 15, 10, 7]
        },

        {
            name: "Istanbul",
            lat: 41.0,
            lon: 29.0,
            high: [9, 10, 13, 18, 22, 27, 30, 30, 26, 21, 16, 11],
            low:  [4, 4, 6, 10, 14, 19, 22, 22, 18, 14, 9, 6]
        },

        {
            name: "Central Anatolia",
            lat: 39.0,
            lon: 33.0,
            high: [4, 7, 12, 18, 23, 28, 32, 32, 27, 20, 12, 6],
            low:  [-5, -4, 0, 5, 9, 13, 16, 16, 11, 6, 1, -3]
        },

        {
            name: "Madrid",
            lat: 40.4,
            lon: -3.7,
            high: [11, 13, 17, 19, 23, 29, 33, 33, 28, 21, 15, 11],
            low:  [1, 2, 5, 7, 11, 15, 18, 18, 14, 9, 4, 2]
        },

        {
            name: "Lisbon",
            lat: 38.7,
            lon: -9.1,
            high: [15, 16, 18, 20, 22, 26, 28, 29, 27, 23, 18, 15],
            low:  [8, 9, 10, 12, 14, 17, 18, 19, 18, 15, 11, 9]
        },

        {
            name: "Mediterranean Spain",
            lat: 39.5,
            lon: -0.5,
            high: [16, 17, 19, 21, 24, 28, 31, 31, 28, 24, 19, 16],
            low:  [7, 8, 10, 12, 16, 20, 23, 23, 20, 16, 11, 8]
        },

        {
            name: "North Africa",
            lat: 35.0,
            lon: 5.0,
            high: [16, 17, 20, 23, 27, 31, 35, 35, 31, 26, 21, 17],
            low:  [7, 8, 10, 13, 17, 21, 24, 24, 21, 17, 12, 8]
        }
    ];


    /* =========================================================
       MONTH INTERPOLATION
    ========================================================= */

    function monthPosition(date) {
        var d =
            validDate(date);

        var month =
            d.getUTCMonth();

        var nextMonth =
            (month + 1) %
            12;

        var start =
            Date.UTC(
                d.getUTCFullYear(),
                month,
                1
            );

        var next;

        if (month === 11) {
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

        var t =
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
            month: month,
            next: nextMonth,
            t: t
        };
    }


    /* =========================================================
       SPATIAL TEMPERATURE CLIMATOLOGY
    ========================================================= */

    function interpolatedNormals(
        latitude,
        longitude,
        date
    ) {
        var mp =
            monthPosition(date);

        var totalWeight = 0;
        var highSum = 0;
        var lowSum = 0;

        var i;

        for (
            i = 0;
            i < TEMP_ANCHORS.length;
            i++
        ) {
            var a =
                TEMP_ANCHORS[i];

            var distance =
                distanceApprox(
                    latitude,
                    longitude,
                    a.lat,
                    a.lon
                );

            var weight =
                1 /
                Math.pow(
                    distance + 1.3,
                    2.35
                );

            /*
             * Nearby stations should dominate much more
             * strongly than remote continental stations.
             */
            if (distance < 3) {
                weight *= 3;
            }

            if (distance < 1.5) {
                weight *= 3;
            }

            var high =
                lerp(
                    a.high[mp.month],
                    a.high[mp.next],
                    mp.t
                );

            var low =
                lerp(
                    a.low[mp.month],
                    a.low[mp.next],
                    mp.t
                );

            highSum +=
                high *
                weight;

            lowSum +=
                low *
                weight;

            totalWeight +=
                weight;
        }

        return {
            high:
                highSum /
                totalWeight,

            low:
                lowSum /
                totalWeight
        };
    }


    /* =========================================================
       CLIMATE HELPERS
    ========================================================= */

    function safeIndex(
        climate,
        name
    ) {
        if (
            !climate ||
            !climate.indices ||
            typeof climate.indices[name] !==
                "number"
        ) {
            return 0;
        }

        return climate.indices[name];
    }

    function climateWeight(
        climate,
        name
    ) {
        if (
            !climate ||
            !climate.normalized ||
            typeof climate.normalized[name] !==
                "number"
        ) {
            return 0;
        }

        return (
            climate.normalized[name] /
            100
        );
    }


    /* =========================================================
       CLIMATOLOGICAL TEMPERATURE CORRECTION
    ========================================================= */

    function localTemperatureNormals(
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
            safeIndex(
                climate,
                "maritime"
            );

        var continental =
            safeIndex(
                climate,
                "continental"
            );

        var warm =
            safeIndex(
                climate,
                "warmSource"
            );

        var cold =
            safeIndex(
                climate,
                "coldSource"
            );

        var seasonal =
            Math.cos(
                TWO_PI *
                (
                    dayOfYear(date) -
                    205
                ) /
                365.2422
            );

        var summer =
            Math.max(
                0,
                seasonal
            );

        var winter =
            Math.max(
                0,
                -seasonal
            );

        /*
         * Climate weights are now corrections,
         * not the source of the whole temperature field.
         */

        normal.high +=
            warm *
            1.0;

        normal.low +=
            warm *
            0.8;

        normal.high -=
            cold *
            1.2;

        normal.low -=
            cold *
            1.5;

        /*
         * Continental areas:
         * slightly hotter afternoons in summer,
         * colder nights/winter.
         */

        normal.high +=
            continental *
            summer *
            0.8;

        normal.low -=
            continental *
            summer *
            0.7;

        normal.high -=
            continental *
            winter *
            0.7;

        normal.low -=
            continental *
            winter *
            1.5;

        /*
         * Maritime locations narrow the daily range.
         */

        normal.high -=
            maritime *
            summer *
            0.5;

        normal.low +=
            maritime *
            winter *
            0.7;

        /*
         * Open water should not use terrestrial
         * high/low range.
         */

        if (landFraction < 0.25) {
            var mean =
                (
                    normal.high +
                    normal.low
                ) /
                2;

            normal.high =
                lerp(
                    mean + 1,
                    normal.high,
                    landFraction *
                    4
                );

            normal.low =
                lerp(
                    mean - 1,
                    normal.low,
                    landFraction *
                    4
                );
        }

        return normal;
    }


    /* =========================================================
       SST

       This is climatological SST with explicit seasonal lag.

       It is not yet persistent year-to-year memory, but unlike
       the previous version the sea maximum is delayed into
       late summer / early autumn.
    ========================================================= */

    function seaSurfaceTemperature(
        latitude,
        longitude,
        date,
        climate
    ) {
        var doy =
            dayOfYear(date);

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

        if (total < 0.05) {
            total = 1;
            atlantic = 1;
        }

        var phase =
            Math.cos(
                TWO_PI *
                (
                    doy -
                    238
                ) /
                365.2422
            );

        var atlanticMean =
            14 -
            Math.max(
                0,
                latitude -
                40
            ) *
            0.22;

        var atlanticAmp =
            3.5 +
            Math.max(
                0,
                latitude -
                45
            ) *
            0.04;

        var atlanticSST =
            atlanticMean +
            atlanticAmp *
            phase;

        var northSeaSST =
            10.7 +
            5.9 *
            phase;

        var balticSST =
            8.0 +
            9.2 *
            phase;

        var mediterraneanSST =
            19.0 +
            6.5 *
            phase;

        var blackSeaSST =
            13.5 +
            9.5 *
            phase;

        var caspianSST =
            13.0 +
            10.5 *
            phase;

        return (
            atlantic *
            atlanticSST +

            northSea *
            northSeaSST +

            baltic *
            balticSST +

            mediterranean *
            mediterraneanSST +

            blackSea *
            blackSeaSST +

            caspian *
            caspianSST
        ) /
        total;
    }


    /* =========================================================
       SYNOPTIC SYSTEMS

       Explicit travelling lows and highs.

       The date determines their positions, meaning the
       entire weather field remains deterministic.
    ========================================================= */

    function synopticSystems(date) {
        var t =
            dayNumber(date);

        var cycle =
            Math.floor(
                t /
                4
            );

        var phase =
            fract(
                t /
                4
            );

        var systems = [];

        var i;

        for (
            i = 0;
            i < 4;
            i++
        ) {
            var seed =
                cycle * 7 +
                i * 19;

            var baseLat =
                47 +
                hash2(
                    seed,
                    1,
                    3
                ) *
                17;

            var startLon =
                -32 +
                hash2(
                    seed,
                    2,
                    4
                ) *
                20;

            var speed =
                14 +
                hash2(
                    seed,
                    3,
                    8
                ) *
                12;

            var lon =
                startLon +
                speed *
                phase;

            /*
             * Allow some systems to continue into Europe
             * from the previous cycle.
             */

            lon +=
                i *
                18;

            var lat =
                baseLat +
                Math.sin(
                    (
                        phase *
                        TWO_PI +
                        i
                    )
                ) *
                3;

            systems.push({
                type:
                    "low",

                lat:
                    lat,

                lon:
                    lon,

                depth:
                    11 +
                    hash2(
                        seed,
                        4,
                        11
                    ) *
                    13,

                radius:
                    7 +
                    hash2(
                        seed,
                        5,
                        12
                    ) *
                    7,

                rotation:
                    hash2(
                        seed,
                        6,
                        14
                    ) *
                    TWO_PI
            });
        }

        /*
         * Subtropical / continental highs.
         */

        systems.push({
            type: "high",
            lat: 38,
            lon:
                -12 +
                Math.sin(
                    t *
                    0.08
                ) *
                8,
            depth: 10,
            radius: 13,
            rotation: 0
        });

        systems.push({
            type: "high",
            lat: 54,
            lon:
                23 +
                Math.sin(
                    t *
                    0.055
                ) *
                15,
            depth: 7,
            radius: 14,
            rotation: 0
        });

        return systems;
    }


    /* =========================================================
       PRESSURE
    ========================================================= */

    function pressure(
        latitude,
        longitude,
        date
    ) {
        var systems =
            synopticSystems(date);

        var p =
            1015;

        var i;

        for (
            i = 0;
            i < systems.length;
            i++
        ) {
            var s =
                systems[i];

            var d =
                distanceApprox(
                    latitude,
                    longitude,
                    s.lat,
                    s.lon
                );

            var effect =
                Math.exp(
                    -(
                        d * d
                    ) /
                    (
                        2 *
                        s.radius *
                        s.radius
                    )
                );

            if (
                s.type ===
                "low"
            ) {
                p -=
                    s.depth *
                    effect;
            } else {
                p +=
                    s.depth *
                    effect;
            }
        }

        /*
         * Weak planetary-wave background.
         */

        var t =
            dayNumber(date);

        p +=
            2.0 *
            Math.sin(
                (
                    longitude *
                    1.5 +
                    t *
                    4.0
                ) *
                DEG
            );

        return p;
    }


    /* =========================================================
       PRESSURE GRADIENT
    ========================================================= */

    function pressureGradient(
        latitude,
        longitude,
        date
    ) {
        var step =
            0.3;

        var n =
            pressure(
                latitude + step,
                longitude,
                date
            );

        var s =
            pressure(
                latitude - step,
                longitude,
                date
            );

        var e =
            pressure(
                latitude,
                longitude + step,
                date
            );

        var w =
            pressure(
                latitude,
                longitude - step,
                date
            );

        var ns =
            (
                n -
                s
            ) /
            (
                2 *
                step
            );

        var ew =
            (
                e -
                w
            ) /
            (
                2 *
                step
            );

        return {
            northSouth:
                ns,

            eastWest:
                ew,

            magnitude:
                Math.sqrt(
                    ns * ns +
                    ew * ew
                )
        };
    }


    /* =========================================================
       WIND
    ========================================================= */

    function windAt(
        latitude,
        longitude,
        date
    ) {
        var g =
            pressureGradient(
                latitude,
                longitude,
                date
            );

        var coriolis =
            clamp(
                (
                    latitude -
                    25
                ) /
                35,
                0.35,
                1
            );

        /*
         * Geostrophic-ish flow.
         */

        var u =
            -g.northSouth *
            3.2 *
            coriolis;

        var v =
            g.eastWest *
            3.2 *
            coriolis;

        /*
         * Weak prevailing westerly component.
         */

        u +=
            1.8 *
            smoothstep(
                38,
                65,
                latitude
            );

        var speed =
            Math.sqrt(
                u * u +
                v * v
            );

        if (
            speed >
            35
        ) {
            var scale =
                35 /
                speed;

            u *= scale;
            v *= scale;
            speed = 35;
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
            uMs: u,
            vMs: v,
            speedMs: speed,
            directionDeg: direction
        };
    }


    /* =========================================================
       LOCAL SOLAR TIME
    ========================================================= */

    function localSolarHour(
        longitude,
        date
    ) {
        var d =
            validDate(date);

        var hour =
            d.getUTCHours() +
            d.getUTCMinutes() /
            60 +
            longitude /
            15;

        return (
            hour %
            24 +
            24
        ) %
        24;
    }


    /* =========================================================
       DAILY TEMPERATURE CURVE

       Daily low around sunrise / early morning.
       Daily high around 14:30 local solar time.
    ========================================================= */

    function dailyTemperature(
        low,
        high,
        longitude,
        date,
        cloud
    ) {
        var hour =
            localSolarHour(
                longitude,
                date
            );

        var mean =
            (
                high +
                low
            ) /
            2;

        var range =
            high -
            low;

        /*
         * Clouds narrow the range but do not destroy it.
         */

        range *=
            clamp(
                1 -
                cloud *
                0.38,
                0.52,
                1
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
            range /
            2
        );
    }


    /* =========================================================
       FRONT GEOMETRY

       Each low generates a wrapped cold/warm frontal structure.
    ========================================================= */

    function frontLift(
        latitude,
        longitude,
        date
    ) {
        var systems =
            synopticSystems(date);

        var strongest =
            0;

        var lowInfluence =
            0;

        var i;

        for (
            i = 0;
            i < systems.length;
            i++
        ) {
            var s =
                systems[i];

            if (
                s.type !==
                "low"
            ) {
                continue;
            }

            var dx =
                (
                    longitude -
                    s.lon
                ) *
                Math.cos(
                    latitude *
                    DEG
                );

            var dy =
                latitude -
                s.lat;

            var radius =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );

            var angle =
                Math.atan2(
                    dy,
                    dx
                );

            /*
             * Spiral frontal radius.
             */

            var desired =
                3.5 +
                (
                    angle +
                    s.rotation +
                    Math.PI
                ) *
                1.35;

            while (
                desired <
                3
            ) {
                desired +=
                    8.5;
            }

            while (
                desired >
                13
            ) {
                desired -=
                    8.5;
            }

            var frontDistance =
                Math.abs(
                    radius -
                    desired
                );

            var band =
                Math.exp(
                    -(
                        frontDistance *
                        frontDistance
                    ) /
                    0.75
                );

            /*
             * Keep fronts close enough to their parent low.
             */

            band *=
                Math.exp(
                    -(
                        radius *
                        radius
                    ) /
                    (
                        2 *
                        14 *
                        14
                    )
                );

            strongest =
                Math.max(
                    strongest,
                    band
                );

            lowInfluence =
                Math.max(
                    lowInfluence,
                    Math.exp(
                        -(
                            radius *
                            radius
                        ) /
                        (
                            2 *
                            8 *
                            8
                        )
                    )
                );
        }

        return {
            front:
                clamp(
                    strongest,
                    0,
                    1
                ),

            lowInfluence:
                clamp(
                    lowInfluence,
                    0,
                    1
                )
        };
    }


    /* =========================================================
       WEATHER TEXTURE

       Broken mesoscale structure rather than huge smooth bands.
    ========================================================= */

    function weatherTexture(
        latitude,
        longitude,
        date
    ) {
        var t =
            dayNumber(date);

        var a =
            0.5 +
            0.5 *
            Math.sin(
                (
                    latitude *
                    8.2 +
                    longitude *
                    11.5 +
                    t *
                    29
                ) *
                DEG
            );

        var b =
            0.5 +
            0.5 *
            Math.cos(
                (
                    latitude *
                    14.1 -
                    longitude *
                    7.8 +
                    t *
                    41
                ) *
                DEG
            );

        var c =
            0.5 +
            0.5 *
            Math.sin(
                (
                    latitude *
                    25.0 +
                    longitude *
                    18.0 +
                    t *
                    67
                ) *
                DEG
            );

        return (
            a *
            0.42 +
            b *
            0.36 +
            c *
            0.22
        );
    }


    /* =========================================================
       UPWIND POINT
    ========================================================= */

    function upstreamPoint(
        latitude,
        longitude,
        wind
    ) {
        if (
            wind.speedMs <
            0.5
        ) {
            return {
                lat:
                    latitude,

                lon:
                    longitude
            };
        }

        var distance =
            clamp(
                1.5 +
                wind.speedMs *
                0.24,
                1.5,
                7
            );

        var lat =
            latitude -
            (
                wind.vMs /
                wind.speedMs
            ) *
            distance;

        var cosLat =
            Math.max(
                0.3,
                Math.cos(
                    latitude *
                    DEG
                )
            );

        var lon =
            longitude -
            (
                wind.uMs /
                wind.speedMs
            ) *
            distance /
            cosLat;

        return {
            lat:
                clamp(
                    lat,
                    30,
                    74
                ),

            lon:
                clamp(
                    lon,
                    -26,
                    52
                )
        };
    }


    /* =========================================================
       MOISTURE

       Moisture is explicitly supplied by maritime source air
       and sea surfaces.

       It is NOT cloud itself.
    ========================================================= */

    function moistureField(
        latitude,
        longitude,
        date,
        climate,
        upstreamClimate,
        wind,
        landFraction,
        temperature,
        sst
    ) {
        var maritime =
            safeIndex(
                climate,
                "maritime"
            );

        var upstreamMaritime =
            safeIndex(
                upstreamClimate,
                "maritime"
            );

        var warmSeaFlux =
            0;

        if (
            landFraction <
            0.6
        ) {
            warmSeaFlux =
                clamp(
                    (
                        sst -
                        temperature +
                        7
                    ) /
                    18,
                    0,
                    1
                );
        }

        var transport =
            clamp(
                wind.speedMs /
                15,
                0.15,
                1
            );

        var texture =
            weatherTexture(
                latitude,
                longitude,
                date
            );

        var moisture =
            0.14;

        moisture +=
            maritime *
            0.28;

        moisture +=
            upstreamMaritime *
            transport *
            0.35;

        moisture +=
            (
                1 -
                landFraction
            ) *
            0.18;

        moisture +=
            warmSeaFlux *
            0.12;

        /*
         * Synoptic variation, but never enough to create
         * cloud solely by itself.
         */

        moisture *=
            0.78 +
            texture *
            0.38;

        return clamp(
            moisture,
            0.04,
            1
        );
    }


    /* =========================================================
       CLOUD

       Distinct mechanisms:
       frontal shield
       cyclone cloud
       broken showers
       high-pressure low cloud
    ========================================================= */

    function cloudField(
        pressureValue,
        moisture,
        fronts,
        texture,
        temperature,
        landFraction,
        sst
    ) {
        var frontCloud =
            fronts.front *
            moisture *
            1.35;

        var cycloneCloud =
            fronts.lowInfluence *
            moisture *
            0.70;

        var instability =
            0;

        if (
            landFraction <
            0.55
        ) {
            instability =
                clamp(
                    (
                        sst -
                        temperature
                    ) /
                    10,
                    0,
                    1
                );
        }

        var showerCloud =
            instability *
            moisture *
            texture *
            0.85;

        /*
         * Moist anticyclonic winter/fog stratus.
         */

        var highPressure =
            clamp(
                (
                    pressureValue -
                    1018
                ) /
                15,
                0,
                1
            );

        var stableLowCloud =
            highPressure *
            moisture *
            clamp(
                (
                    12 -
                    temperature
                ) /
                14,
                0,
                1
            ) *
            0.45;

        var cloud =
            0.05 +
            frontCloud +
            cycloneCloud +
            showerCloud +
            stableLowCloud;

        /*
         * Fine broken structure.
         */

        cloud *=
            0.78 +
            texture *
            0.34;

        return clamp(
            cloud,
            0.02,
            1
        );
    }


    /* =========================================================
       PRECIPITATION

       Moisture alone cannot precipitate.

       Must have either:
       frontal lift
       cyclone lift
       convective instability
    ========================================================= */

    function precipitationField(
        pressureValue,
        moisture,
        fronts,
        texture,
        temperature,
        landFraction,
        sst,
        cloud
    ) {
        var frontalLift =
            fronts.front;

        var cycloneLift =
            fronts.lowInfluence *
            clamp(
                (
                    1017 -
                    pressureValue
                ) /
                15,
                0,
                1
            );

        var seaInstability =
            0;

        if (
            landFraction <
            0.65
        ) {
            seaInstability =
                clamp(
                    (
                        sst -
                        temperature -
                        1
                    ) /
                    10,
                    0,
                    1
                );
        }

        var showers =
            seaInstability *
            texture *
            fronts.lowInfluence;

        var lift =
            Math.max(
                frontalLift,
                cycloneLift *
                0.75,
                showers *
                0.9
            );

        var potential =
            moisture *
            lift *
            (
                0.65 +
                cloud *
                0.45
            );

        /*
         * Much lower than previous broken threshold.
         *
         * Strong fronts now actually rain.
         */

        var precipitating =
            potential >
            0.18;

        var intensity =
            0;

        if (
            precipitating
        ) {
            intensity =
                clamp(
                    (
                        potential -
                        0.18
                    ) /
                    0.52,
                    0.08,
                    1
                );
        }

        var chance =
            clamp(
                (
                    potential -
                    0.08
                ) /
                0.40,
                0,
                1
            );

        return {
            potential:
                potential,

            chance:
                chance,

            intensity:
                intensity,

            precipitating:
                precipitating
        };
    }


    /* =========================================================
       PRECIPITATION PHASE
    ========================================================= */

    function precipitationType(
        temperature,
        precipitating
    ) {
        if (
            !precipitating
        ) {
            return "dry";
        }

        if (
            temperature <=
            1.5
        ) {
            return "snow";
        }

        if (
            temperature <=
            3.0
        ) {
            return "sleet";
        }

        return "rain";
    }


    /* =========================================================
       TEMPERATURE ADVECTION
    ========================================================= */

    function advectionCorrection(
        latitude,
        longitude,
        date,
        wind,
        localMean
    ) {
        var up =
            upstreamPoint(
                latitude,
                longitude,
                wind
            );

        var upstreamNormals =
            interpolatedNormals(
                up.lat,
                up.lon,
                date
            );

        var upstreamMean =
            (
                upstreamNormals.high +
                upstreamNormals.low
            ) /
            2;

        var strength =
            clamp(
                wind.speedMs /
                20,
                0,
                0.70
            );

        var correction =
            (
                upstreamMean -
                localMean
            ) *
            strength;

        return clamp(
            correction,
            -8,
            8
        );
    }


    /* =========================================================
       SIMULATE
    ========================================================= */

    function simulate(
        latitude,
        longitude,
        date,
        options
    ) {
        var d =
            validDate(date);

        if (
            !window.EuropaClimate ||
            typeof window.EuropaClimate.getIndices !==
                "function"
        ) {
            throw new Error(
                "EuropaClimate is not available."
            );
        }

        if (
            !options
        ) {
            options = {};
        }

        var landFraction =
            0.5;

        if (
            typeof options.landFraction ===
                "number" &&
            isFinite(
                options.landFraction
            )
        ) {
            landFraction =
                clamp(
                    options.landFraction,
                    0,
                    1
                );
        }

        var climate =
            window.EuropaClimate.getIndices(
                latitude,
                longitude,
                {
                    landFraction:
                        landFraction
                }
            );

        var pressureValue =
            pressure(
                latitude,
                longitude,
                d
            );

        var gradient =
            pressureGradient(
                latitude,
                longitude,
                d
            );

        var wind =
            windAt(
                latitude,
                longitude,
                d
            );

        var upPoint =
            upstreamPoint(
                latitude,
                longitude,
                wind
            );

        var upstreamClimate =
            window.EuropaClimate.getIndices(
                upPoint.lat,
                upPoint.lon,
                {
                    landFraction:
                        0.5
                }
            );

        var normals =
            localTemperatureNormals(
                latitude,
                longitude,
                d,
                climate,
                landFraction
            );

        var normalMean =
            (
                normals.high +
                normals.low
            ) /
            2;

        var fronts =
            frontLift(
                latitude,
                longitude,
                d
            );

        var texture =
            weatherTexture(
                latitude,
                longitude,
                d
            );

        var sst =
            seaSurfaceTemperature(
                latitude,
                longitude,
                d,
                climate
            );

        /*
         * First temperature estimate before cloud.
         */

        var preliminaryTemperature =
            dailyTemperature(
                normals.low,
                normals.high,
                longitude,
                d,
                0.25
            );

        var advection =
            advectionCorrection(
                latitude,
                longitude,
                d,
                wind,
                normalMean
            );

        preliminaryTemperature +=
            advection;

        /*
         * Air over sea is gradually pulled toward SST.
         */

        if (
            landFraction <
            0.7
        ) {
            var seaCoupling =
                (
                    1 -
                    landFraction
                ) *
                clamp(
                    0.18 +
                    wind.speedMs /
                    45,
                    0.18,
                    0.65
                );

            preliminaryTemperature =
                lerp(
                    preliminaryTemperature,
                    sst,
                    seaCoupling
                );
        }

        var moisture =
            moistureField(
                latitude,
                longitude,
                d,
                climate,
                upstreamClimate,
                wind,
                landFraction,
                preliminaryTemperature,
                sst
            );

        var cloud =
            cloudField(
                pressureValue,
                moisture,
                fronts,
                texture,
                preliminaryTemperature,
                landFraction,
                sst
            );

        /*
         * Recalculate temperature using actual cloud cover.
         */

        var temperature =
            dailyTemperature(
                normals.low,
                normals.high,
                longitude,
                d,
                cloud
            );

        temperature +=
            advection;

        /*
         * Synoptic pressure anomaly.
         */

        temperature +=
            clamp(
                (
                    pressureValue -
                    1015
                ) *
                0.035,
                -1.2,
                1.2
            );

        /*
         * Apply sea coupling once more.
         */

        if (
            landFraction <
            0.7
        ) {
            var finalSeaCoupling =
                (
                    1 -
                    landFraction
                ) *
                clamp(
                    0.18 +
                    wind.speedMs /
                    45,
                    0.18,
                    0.65
                );

            temperature =
                lerp(
                    temperature,
                    sst,
                    finalSeaCoupling
                );
        }

        var precipitation =
            precipitationField(
                pressureValue,
                moisture,
                fronts,
                texture,
                temperature,
                landFraction,
                sst,
                cloud
            );

        var phase =
            precipitationType(
                temperature,
                precipitation.precipitating
            );

        var humidity =
            clamp(
                30 +
                moisture *
                62 +
                cloud *
                12,
                20,
                100
            );

        return {
            date:
                d.toISOString(),

            lat:
                latitude,

            lon:
                longitude,

            climate:
                climate,

            pressureHpa:
                pressureValue,

            pressureGradient:
                gradient.magnitude,

            wind:
                wind,

            climatologicalHighC:
                normals.high,

            climatologicalLowC:
                normals.low,

            baselineTemperatureC:
                normalMean,

            advectionTemperatureC:
                advection,

            seaSurfaceTemperatureC:
                sst,

            temperatureC:
                temperature,

            moisture:
                moisture,

            humidityPct:
                humidity,

            cloudFraction:
                cloud,

            frontalStrength:
                fronts.front,

            cycloneInfluence:
                fronts.lowInfluence,

            precipitationPotential:
                precipitation.potential,

            precipitationChance:
                precipitation.chance,

            precipitationIntensity:
                precipitation.intensity,

            precipitationType:
                phase
        };
    }


    /* =========================================================
       PUBLIC API
    ========================================================= */

    window.EuropaWeather = {
        version:
            "3.0-climatology-synoptic",

        pressure:
            pressure,

        pressureGradient:
            pressureGradient,

        windAt:
            windAt,

        simulate:
            simulate,

        seaSurfaceTemperature:
            seaSurfaceTemperature,

        interpolatedNormals:
            interpolatedNormals
    };

    console.log(
        "EuropaCraft Weather Engine loaded:",
        window.EuropaWeather.version
    );

})();
