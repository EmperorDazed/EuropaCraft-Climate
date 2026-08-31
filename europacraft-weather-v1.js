(function () {
    "use strict";

    /* =========================================================
       EuropaCraft Weather Engine
       Version 4.0

       Main changes:
       - Proper normal weather regimes
       - Separate climatological-average diagnostic mode
       - Much stronger and more realistic wind
       - No sinusoidal / wavy cloud texture
       - Coherent synoptic cloud shields
       - Frontal cloud bands
       - Convective / post-frontal cloud
       - Precipitation actually occurs
       - Average mode can be toggled from index.html

       Requires:
       window.EuropaClimate.getIndices()
    ========================================================= */

    var DEG = Math.PI / 180;
    var TWO_PI = Math.PI * 2;

    var averageMode = false;


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

    function fract(x) {
        return x - Math.floor(x);
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
       DETERMINISTIC RANDOM NUMBER GENERATOR
    ========================================================= */

    function hash1(n) {
        var x =
            Math.sin(
                n * 127.1 +
                311.7
            ) *
            43758.5453123;

        return fract(x);
    }

    function hash2(x, y, seed) {
        var n =
            x * 127.1 +
            y * 311.7 +
            seed * 74.7;

        return hash1(n);
    }


    /* =========================================================
       NON-WAVY VALUE NOISE

       This replaces the old sine/cosine cloud texture.

       Adjacent cells remain related but there are no giant
       curved periodic stripes across Europe.
    ========================================================= */

    function valueNoise(x, y, seed, scale) {
        var sx =
            x /
            scale;

        var sy =
            y /
            scale;

        var x0 =
            Math.floor(sx);

        var y0 =
            Math.floor(sy);

        var tx =
            fract(sx);

        var ty =
            fract(sy);

        tx =
            tx *
            tx *
            (3 - 2 * tx);

        ty =
            ty *
            ty *
            (3 - 2 * ty);

        var a =
            hash2(
                x0,
                y0,
                seed
            );

        var b =
            hash2(
                x0 + 1,
                y0,
                seed
            );

        var c =
            hash2(
                x0,
                y0 + 1,
                seed
            );

        var d =
            hash2(
                x0 + 1,
                y0 + 1,
                seed
            );

        var ab =
            lerp(
                a,
                b,
                tx
            );

        var cd =
            lerp(
                c,
                d,
                tx
            );

        return lerp(
            ab,
            cd,
            ty
        );
    }

    function multiScaleNoise(lat, lon, date) {
        var seed =
            Math.floor(
                dayNumber(date) *
                4
            );

        var broad =
            valueNoise(
                lon,
                lat,
                seed,
                5.5
            );

        var medium =
            valueNoise(
                lon,
                lat,
                seed + 91,
                2.2
            );

        var fine =
            valueNoise(
                lon,
                lat,
                seed + 207,
                0.85
            );

        return (
            broad * 0.48 +
            medium * 0.34 +
            fine * 0.18
        );
    }


    /* =========================================================
       TEMPERATURE NORMALS

       Jan to Dec:
       average daily maximum / minimum.

       These are broad climatological control anchors.
    ========================================================= */

    var TEMP_ANCHORS = [

        {
            lat: 51.5,
            lon: -0.5,
            high: [8, 9, 11, 15, 18, 21, 23, 23, 20, 16, 11, 8],
            low:  [2, 2, 4, 6, 9, 12, 14, 14, 11, 8, 5, 2]
        },

        {
            lat: 54.5,
            lon: -2.0,
            high: [7, 8, 10, 13, 16, 19, 21, 20, 17, 13, 9, 7],
            low:  [1, 1, 3, 5, 8, 11, 13, 12, 10, 7, 4, 1]
        },

        {
            lat: 56.5,
            lon: -4.0,
            high: [6, 7, 9, 12, 15, 17, 19, 18, 16, 12, 8, 6],
            low:  [0, 0, 2, 4, 7, 9, 11, 11, 9, 6, 3, 0]
        },

        {
            lat: 53.3,
            lon: -8.0,
            high: [8, 9, 11, 13, 16, 18, 20, 20, 18, 14, 10, 8],
            low:  [3, 3, 4, 5, 8, 10, 12, 12, 10, 7, 5, 3]
        },

        {
            lat: 47.5,
            lon: -2.0,
            high: [10, 11, 14, 16, 20, 23, 25, 25, 22, 18, 13, 10],
            low:  [4, 4, 6, 8, 11, 14, 16, 16, 13, 10, 6, 4]
        },

        {
            lat: 47.0,
            lon: 2.5,
            high: [7, 9, 13, 17, 21, 25, 27, 27, 23, 17, 11, 8],
            low:  [1, 1, 4, 6, 10, 13, 15, 15, 11, 8, 4, 2]
        },

        {
            lat: 52.5,
            lon: 13.4,
            high: [3, 6, 9, 15, 20, 23, 25, 24, 20, 14, 8, 4],
            low:  [-1, 0, 1, 5, 9, 13, 15, 14, 11, 7, 3, 0]
        },

        {
            lat: 52.2,
            lon: 21.0,
            high: [1.0, 2.6, 7.4, 14.6, 19.8, 23.1, 25.2, 24.7, 19.1, 12.9, 6.5, 2.3],
            low:  [-4.0, -3.3, -0.6, 4.0, 8.8, 12.4, 14.5, 13.8, 9.5, 5.0, 1.3, -2.5]
        },

        {
            lat: 54.2,
            lon: 18.0,
            high: [2, 3, 7, 12, 17, 20, 22, 22, 18, 12, 7, 3],
            low:  [-2, -2, 0, 4, 8, 11, 14, 14, 10, 6, 2, -1]
        },

        {
            lat: 56.5,
            lon: 24.0,
            high: [-1, 0, 5, 12, 18, 21, 24, 23, 17, 10, 4, 0],
            low:  [-6, -6, -2, 3, 8, 12, 15, 14, 9, 4, 0, -4]
        },

        {
            lat: 60.2,
            lon: 24.9,
            high: [-2, -2, 2, 9, 16, 20, 23, 21, 16, 9, 3, 0],
            low:  [-7, -8, -5, 0, 5, 10, 13, 12, 8, 3, -1, -5]
        },

        {
            lat: 59.3,
            lon: 18.1,
            high: [1, 1, 5, 11, 17, 21, 23, 22, 17, 11, 6, 2],
            low:  [-4, -4, -2, 2, 6, 11, 14, 13, 9, 4, 1, -3]
        },

        {
            lat: 59.9,
            lon: 10.7,
            high: [-1, 0, 5, 11, 17, 21, 22, 21, 16, 9, 3, 0],
            low:  [-6, -6, -3, 1, 6, 10, 14, 12, 8, 3, -1, -5]
        },

        {
            lat: 61.0,
            lon: 5.5,
            high: [5, 5, 7, 10, 14, 17, 19, 19, 16, 11, 7, 5],
            low:  [1, 1, 2, 4, 7, 10, 12, 12, 9, 6, 3, 1]
        },

        {
            lat: 68.0,
            lon: 20.0,
            high: [-8, -7, -2, 4, 10, 15, 18, 16, 10, 3, -3, -7],
            low:  [-16, -15, -11, -5, 1, 6, 9, 7, 2, -4, -10, -14]
        },

        {
            lat: 55.8,
            lon: 37.6,
            high: [-6.3, -4.2, 1.5, 10.4, 18.4, 21.7, 23.1, 21.5, 15.4, 8.2, 1.1, -3.5],
            low:  [-12.3, -11.1, -5.6, 1.7, 7.6, 11.5, 13.5, 12.0, 7.1, 2.1, -3.3, -8.6]
        },

        {
            lat: 49.5,
            lon: 31.0,
            high: [-2, 0, 6, 15, 21, 25, 27, 27, 21, 13, 5, 0],
            low:  [-8, -7, -2, 5, 10, 14, 16, 15, 10, 5, 0, -5]
        },

        {
            lat: 47.2,
            lon: 19.3,
            high: [3, 6, 11, 17, 22, 26, 28, 28, 23, 17, 10, 4],
            low:  [-2, -1, 3, 7, 11, 15, 17, 16, 12, 7, 3, -1]
        },

        {
            lat: 44.4,
            lon: 26.1,
            high: [3, 6, 12, 19, 24, 28, 30, 30, 25, 18, 10, 4],
            low:  [-5, -4, 0, 5, 10, 14, 16, 15, 11, 6, 1, -3]
        },

        {
            lat: 43.5,
            lon: 16.4,
            high: [11, 12, 15, 19, 24, 28, 31, 31, 26, 21, 16, 12],
            low:  [5, 6, 8, 11, 15, 19, 22, 22, 18, 14, 10, 6]
        },

        {
            lat: 45.2,
            lon: 9.5,
            high: [7, 10, 14, 18, 23, 27, 30, 29, 24, 18, 12, 8],
            low:  [0, 2, 5, 9, 13, 17, 19, 18, 14, 10, 5, 1]
        },

        {
            lat: 41.9,
            lon: 12.5,
            high: [13, 14, 17, 20, 24, 28, 30, 30, 27, 22, 17, 14],
            low:  [4, 4, 7, 10, 14, 18, 20, 20, 17, 13, 9, 5]
        },

        {
            lat: 38.0,
            lon: 23.7,
            high: [12, 13, 16, 21, 26, 31, 33, 33, 29, 23, 18, 14],
            low:  [5, 6, 8, 12, 16, 21, 22, 22, 19, 15, 10, 7]
        },

        {
            lat: 41.0,
            lon: 29.0,
            high: [9, 10, 13, 18, 22, 27, 30, 30, 26, 21, 16, 11],
            low:  [4, 4, 6, 10, 14, 19, 22, 22, 18, 14, 9, 6]
        },

        {
            lat: 39.0,
            lon: 33.0,
            high: [4, 7, 12, 18, 23, 28, 32, 32, 27, 20, 12, 6],
            low:  [-5, -4, 0, 5, 9, 13, 16, 16, 11, 6, 1, -3]
        },

        {
            lat: 40.4,
            lon: -3.7,
            high: [11, 13, 17, 19, 23, 29, 33, 33, 28, 21, 15, 11],
            low:  [1, 2, 5, 7, 11, 15, 18, 18, 14, 9, 4, 2]
        },

        {
            lat: 38.7,
            lon: -9.1,
            high: [15, 16, 18, 20, 22, 26, 28, 29, 27, 23, 18, 15],
            low:  [8, 9, 10, 12, 14, 17, 18, 19, 18, 15, 11, 9]
        },

        {
            lat: 39.5,
            lon: -0.5,
            high: [16, 17, 19, 21, 24, 28, 31, 31, 28, 24, 19, 16],
            low:  [7, 8, 10, 12, 16, 20, 23, 23, 20, 16, 11, 8]
        },

        {
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

    function interpolatedNormals(
        latitude,
        longitude,
        date
    ) {
        var mp =
            monthPosition(date);

        var totalWeight =
            0;

        var highSum =
            0;

        var lowSum =
            0;

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

            if (
                distance <
                3
            ) {
                weight *=
                    3;
            }

            if (
                distance <
                1.5
            ) {
                weight *=
                    3;
            }

            var high =
                lerp(
                    a.high[
                        mp.month
                    ],
                    a.high[
                        mp.next
                    ],
                    mp.t
                );

            var low =
                lerp(
                    a.low[
                        mp.month
                    ],
                    a.low[
                        mp.next
                    ],
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
       LOCAL TEMPERATURE NORMALS
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

        normal.high -=
            maritime *
            summer *
            0.5;

        normal.low +=
            maritime *
            winter *
            0.7;

        if (
            landFraction <
            0.25
        ) {
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
                    landFraction * 4
                );

            normal.low =
                lerp(
                    mean - 1,
                    normal.low,
                    landFraction * 4
                );
        }

        return normal;
    }


    /* =========================================================
       SST WITH SEASONAL LAG
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

        if (
            total <
            0.05
        ) {
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
       WEATHER REGIMES

       These are NOT climatological averages.

       A regime is selected deterministically from the date
       so the same date always gives the same weather.

       Regime changes roughly every 4 days.
    ========================================================= */

    var REGIMES = [
        "atlantic_westerly",
        "southwesterly",
        "northwesterly",
        "northerly",
        "easterly",
        "southeasterly",
        "southerly",
        "blocking",
        "weak_variable"
    ];

    function currentRegime(date) {
        if (
            averageMode
        ) {
            return {
                name:
                    "climatological_average",

                strength:
                    1.0,

                centreLat:
                    52,

                centreLon:
                    10,

                radius:
                    100
            };
        }

        var t =
            dayNumber(date);

        var period =
            Math.floor(
                t /
                4
            );

        var random =
            hash1(
                period *
                17.731
            );

        var index =
            Math.floor(
                random *
                REGIMES.length
            );

        index =
            clamp(
                index,
                0,
                REGIMES.length -
                1
            );

        var name =
            REGIMES[
                index
            ];

        var strength =
            0.65 +
            hash1(
                period *
                27.417
            ) *
            0.75;

        var centreLat =
            45 +
            hash1(
                period *
                91.31
            ) *
            18;

        var centreLon =
            -5 +
            hash1(
                period *
                51.19
            ) *
            35;

        var radius =
            14 +
            hash1(
                period *
                79.71
            ) *
            18;

        return {
            name:
                name,

            strength:
                strength,

            centreLat:
                centreLat,

            centreLon:
                centreLon,

            radius:
                radius
        };
    }


    /* =========================================================
       CLIMATOLOGICAL WIND

       Used as the balancing / "dead average" field.

       IMPORTANT:
       normal weather adds regimes and synoptic systems on top.
    ========================================================= */

    function climatologicalWind(
        latitude,
        longitude,
        date
    ) {
        var u =
            0;

        var v =
            0;

        /*
         * Mid-latitude prevailing westerlies.
         */

        var midLatitude =
            smoothstep(
                34,
                45,
                latitude
            ) *
            (
                1 -
                smoothstep(
                    69,
                    75,
                    latitude
                )
            );

        u +=
            3.5 *
            midLatitude;

        /*
         * Atlantic / northern Europe stronger.
         */

        var atlantic =
            1 -
            smoothstep(
                -10,
                20,
                longitude
            );

        u +=
            atlantic *
            midLatitude *
            1.8;

        /*
         * Northern storm-track contribution.
         */

        var northern =
            smoothstep(
                52,
                62,
                latitude
            ) *
            (
                1 -
                smoothstep(
                    72,
                    76,
                    latitude
                )
            );

        u +=
            northern *
            1.4;

        /*
         * Mediterranean average weaker.
         */

        if (
            latitude <
            43
        ) {
            u *=
                0.68;

            v *=
                0.68;
        }

        return {
            uMs:
                u,

            vMs:
                v
        };
    }


    /* =========================================================
       REGIME WIND COMPONENT
    ========================================================= */

    function regimeWind(
        latitude,
        longitude,
        date
    ) {
        var regime =
            currentRegime(date);

        if (
            regime.name ===
            "climatological_average"
        ) {
            return {
                uMs: 0,
                vMs: 0,
                influence: 0,
                name:
                    regime.name
            };
        }

        var distance =
            distanceApprox(
                latitude,
                longitude,
                regime.centreLat,
                regime.centreLon
            );

        var influence =
            Math.exp(
                -(
                    distance *
                    distance
                ) /
                (
                    2 *
                    regime.radius *
                    regime.radius
                )
            );

        /*
         * Even outside centre there should still be
         * some continental-scale influence.
         */

        influence =
            0.35 +
            influence *
            0.65;

        var speed =
            4.5 *
            regime.strength *
            influence;

        var u =
            0;

        var v =
            0;

        switch (
            regime.name
        ) {

            case "atlantic_westerly":

                u =
                    speed *
                    1.25;

                v =
                    speed *
                    0.10;

                break;


            case "southwesterly":

                u =
                    speed;

                v =
                    speed *
                    0.72;

                break;


            case "northwesterly":

                u =
                    speed;

                v =
                    -speed *
                    0.72;

                break;


            case "northerly":

                u =
                    speed *
                    0.12;

                v =
                    -speed *
                    1.2;

                break;


            case "easterly":

                u =
                    -speed *
                    1.15;

                v =
                    speed *
                    0.05;

                break;


            case "southeasterly":

                u =
                    -speed *
                    0.82;

                v =
                    speed *
                    0.72;

                break;


            case "southerly":

                u =
                    speed *
                    0.15;

                v =
                    speed *
                    1.15;

                break;


            case "blocking":

                u =
                    -speed *
                    0.12;

                v =
                    speed *
                    0.08;

                break;


            case "weak_variable":

                var direction =
                    hash1(
                        Math.floor(
                            dayNumber(date) /
                            4
                        ) *
                        119.7
                    ) *
                    TWO_PI;

                u =
                    Math.cos(
                        direction
                    ) *
                    speed *
                    0.45;

                v =
                    Math.sin(
                        direction
                    ) *
                    speed *
                    0.45;

                break;
        }

        return {
            uMs:
                u,

            vMs:
                v,

            influence:
                influence,

            name:
                regime.name
        };
    }


    /* =========================================================
       SYNOPTIC LOWS / HIGHS

       Average mode removes travelling systems completely.
    ========================================================= */

    function synopticSystems(date) {
        if (
            averageMode
        ) {
            return [];
        }

        var t =
            dayNumber(date);

        var cycle =
            Math.floor(
                t /
                5
            );

        var progress =
            fract(
                t /
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
            var seed =
                cycle *
                31 +
                i *
                97;

            var startLon =
                -34 +
                hash1(
                    seed + 2
                ) *
                12;

            var travel =
                52 +
                hash1(
                    seed + 4
                ) *
                28;

            var lat =
                48 +
                hash1(
                    seed + 6
                ) *
                17;

            lat +=
                (
                    hash1(
                        seed + 19
                    ) -
                    0.5
                ) *
                5;

            var lon =
                startLon +
                travel *
                progress +
                i *
                16;

            systems.push({
                type:
                    "low",

                lat:
                    lat,

                lon:
                    lon,

                depth:
                    12 +
                    hash1(
                        seed + 7
                    ) *
                    13,

                radius:
                    6 +
                    hash1(
                        seed + 9
                    ) *
                    6,

                frontRotation:
                    hash1(
                        seed + 12
                    ) *
                    TWO_PI
            });
        }

        /*
         * Semi-persistent high.
         */

        systems.push({
            type:
                "high",

            lat:
                39 +
                hash1(
                    cycle * 41
                ) *
                7,

            lon:
                -9 +
                hash1(
                    cycle * 59
                ) *
                28,

            depth:
                7 +
                hash1(
                    cycle * 61
                ) *
                8,

            radius:
                12 +
                hash1(
                    cycle * 67
                ) *
                7
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
        if (
            averageMode
        ) {
            /*
             * Deliberately boring climatological pressure.
             * Useful for balancing temperature / wind fields.
             */

            return (
                1015 +
                (
                    latitude -
                    50
                ) *
                0.025
            );
        }

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
                        d *
                        d
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
            0.25;

        var n =
            pressure(
                latitude +
                step,
                longitude,
                date
            );

        var s =
            pressure(
                latitude -
                step,
                longitude,
                date
            );

        var e =
            pressure(
                latitude,
                longitude +
                step,
                date
            );

        var w =
            pressure(
                latitude,
                longitude -
                step,
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
                    ns *
                    ns +
                    ew *
                    ew
                )
        };
    }


    /* =========================================================
       WIND

       Combination:
       climatology
       + weather regime
       + pressure-gradient flow
       + small non-wavy perturbation
    ========================================================= */

    function windAt(
        latitude,
        longitude,
        date
    ) {
        var base =
            climatologicalWind(
                latitude,
                longitude,
                date
            );

        if (
            averageMode
        ) {
            var averageSpeed =
                Math.sqrt(
                    base.uMs *
                    base.uMs +
                    base.vMs *
                    base.vMs
                );

            var averageDirection =
                (
                    Math.atan2(
                        -base.uMs,
                        -base.vMs
                    ) /
                    DEG +
                    360
                ) %
                360;

            return {
                uMs:
                    base.uMs,

                vMs:
                    base.vMs,

                speedMs:
                    averageSpeed,

                directionDeg:
                    averageDirection,

                regime:
                    "climatological_average"
            };
        }

        var regime =
            regimeWind(
                latitude,
                longitude,
                date
            );

        var gradient =
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
                0.4,
                1
            );

        /*
         * Stronger than the old 3.2 multiplier.
         */

        var pressureU =
            -gradient.northSouth *
            14.0 *
            coriolis;

        var pressureV =
            gradient.eastWest *
            14.0 *
            coriolis;

        var noise =
            multiScaleNoise(
                latitude,
                longitude,
                date
            );

        /*
         * Only a small perturbation.
         * It does not dominate the organised flow.
         */

        var perturb =
            (
                noise -
                0.5
            ) *
            1.2;

        var u =
            base.uMs +
            regime.uMs +
            pressureU +
            perturb;

        var v =
            base.vMs +
            regime.vMs +
            pressureV +
            perturb *
            0.55;

        var speed =
            Math.sqrt(
                u *
                u +
                v *
                v
            );

        if (
            speed >
            32
        ) {
            var scale =
                32 /
                speed;

            u *=
                scale;

            v *=
                scale;

            speed =
                32;
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
                direction,

            regime:
                regime.name
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
       DAILY TEMPERATURE
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

        range *=
            clamp(
                1 -
                cloud *
                0.34,
                0.58,
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
       FRONTS AND CYCLONE STRUCTURE

       No sine waves.

       Fronts are curved geometric bands attached to lows.
    ========================================================= */

    function synopticStructure(
        latitude,
        longitude,
        date
    ) {
        if (
            averageMode
        ) {
            return {
                front:
                    0,

                lowInfluence:
                    0,

                frontalDistance:
                    999
            };
        }

        var systems =
            synopticSystems(date);

        var strongestFront =
            0;

        var strongestLow =
            0;

        var bestDistance =
            999;

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

            var meanLat =
                (
                    latitude +
                    s.lat
                ) *
                0.5 *
                DEG;

            var dx =
                (
                    longitude -
                    s.lon
                ) *
                Math.cos(
                    meanLat
                );

            var dy =
                latitude -
                s.lat;

            var radius =
                Math.sqrt(
                    dx *
                    dx +
                    dy *
                    dy
                );

            var lowEffect =
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
                );

            strongestLow =
                Math.max(
                    strongestLow,
                    lowEffect
                );

            /*
             * Cold front extending south-westward.
             */

            var coldAngle =
                -2.35 +
                s.frontRotation *
                0.12;

            var coldAlong =
                dx *
                Math.cos(
                    coldAngle
                ) +
                dy *
                Math.sin(
                    coldAngle
                );

            var coldCross =
                Math.abs(
                    -dx *
                    Math.sin(
                        coldAngle
                    ) +
                    dy *
                    Math.cos(
                        coldAngle
                    )
                );

            var coldFront =
                0;

            if (
                coldAlong >
                1 &&
                coldAlong <
                16
            ) {
                coldFront =
                    Math.exp(
                        -(
                            coldCross *
                            coldCross
                        ) /
                        (
                            2 *
                            0.85 *
                            0.85
                        )
                    );

                coldFront *=
                    smoothstep(
                        16,
                        6,
                        coldAlong
                    );
            }

            /*
             * Warm front extending east / north-eastward.
             */

            var warmAngle =
                0.42 +
                s.frontRotation *
                0.08;

            var warmAlong =
                dx *
                Math.cos(
                    warmAngle
                ) +
                dy *
                Math.sin(
                    warmAngle
                );

            var warmCross =
                Math.abs(
                    -dx *
                    Math.sin(
                        warmAngle
                    ) +
                    dy *
                    Math.cos(
                        warmAngle
                    )
                );

            var warmFront =
                0;

            if (
                warmAlong >
                0 &&
                warmAlong <
                13
            ) {
                warmFront =
                    Math.exp(
                        -(
                            warmCross *
                            warmCross
                        ) /
                        (
                            2 *
                            1.25 *
                            1.25
                        )
                    );

                warmFront *=
                    smoothstep(
                        13,
                        4,
                        warmAlong
                    );
            }

            var combined =
                Math.max(
                    coldFront,
                    warmFront
                );

            if (
                combined >
                strongestFront
            ) {
                strongestFront =
                    combined;

                bestDistance =
                    Math.min(
                        coldCross,
                        warmCross
                    );
            }
        }

        return {
            front:
                clamp(
                    strongestFront,
                    0,
                    1
                ),

            lowInfluence:
                clamp(
                    strongestLow,
                    0,
                    1
                ),

            frontalDistance:
                bestDistance
        };
    }


    /* =========================================================
       UPSTREAM POINT

       Stronger winds inspect farther upstream.
    ========================================================= */

    function upstreamPoint(
        latitude,
        longitude,
        wind
    ) {
        if (
            wind.speedMs <
            0.2
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
                1.2 +
                wind.speedMs *
                0.42,
                1.2,
                10
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

        var seaFraction =
            1 -
            landFraction;

        var transport =
            clamp(
                wind.speedMs /
                12,
                0.12,
                1
            );

        var seaFlux =
            seaFraction *
            clamp(
                (
                    sst -
                    temperature +
                    10
                ) /
                20,
                0.15,
                1
            );

        var noise =
            multiScaleNoise(
                latitude,
                longitude,
                date
            );

        var moisture =
            0.22;

        moisture +=
            maritime *
            0.24;

        moisture +=
            upstreamMaritime *
            transport *
            0.33;

        moisture +=
            seaFraction *
            0.18;

        moisture +=
            seaFlux *
            0.16;

        moisture +=
            (
                noise -
                0.5
            ) *
            0.10;

        return clamp(
            moisture,
            0.08,
            1
        );
    }


    /* =========================================================
       CLOUD FIELD

       No wave functions.

       Main components:
       - frontal cloud
       - cyclone shield
       - post-frontal / maritime convection
       - random mesoscale cloud areas
       - high pressure suppression
    ========================================================= */

    function cloudField(
        latitude,
        longitude,
        date,
        pressureValue,
        moisture,
        structure,
        temperature,
        landFraction,
        sst
    ) {
        if (
            averageMode
        ) {
            /*
             * Climatological balancing value only.
             * Do not interpret as actual day's cloud map.
             */

            return clamp(
                0.32 +
                moisture *
                0.28,
                0.18,
                0.72
            );
        }

        var noise =
            multiScaleNoise(
                latitude,
                longitude,
                date
            );

        /*
         * Broad cyclone cloud shield.
         */

        var cycloneCloud =
            structure.lowInfluence *
            (
                0.35 +
                moisture *
                0.48
            );

        /*
         * Fronts are naturally very cloudy.
         */

        var frontalCloud =
            structure.front *
            (
                0.55 +
                moisture *
                0.52
            );

        /*
         * Cold air over relatively warm sea.
         */

        var instability =
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

        var maritimeConvection =
            instability *
            (
                1 -
                landFraction
            ) *
            (
                0.20 +
                noise *
                0.70
            );

        /*
         * Mesoscale broken cloud elsewhere.
         *
         * This is random-looking but spatially coherent.
         */

        var brokenCloud =
            moisture *
            smoothstep(
                0.48,
                0.77,
                noise
            ) *
            0.55;

        /*
         * High pressure clears most deep cloud.
         */

        var highSuppression =
            clamp(
                (
                    pressureValue -
                    1018
                ) /
                14,
                0,
                0.70
            );

        var cloud =
            0.06 +
            cycloneCloud +
            frontalCloud +
            maritimeConvection +
            brokenCloud;

        cloud *=
            1 -
            highSuppression;

        /*
         * Moist cool anticyclones can still have low stratus.
         */

        if (
            pressureValue >
            1020 &&
            moisture >
            0.55 &&
            temperature <
            10
        ) {
            cloud =
                Math.max(
                    cloud,
                    0.25 +
                    moisture *
                    0.35
                );
        }

        return clamp(
            cloud,
            0.02,
            1
        );
    }


    /* =========================================================
       PRECIPITATION

       Intentionally generous initial calibration.

       Rain/snow can occur from:
       - fronts
       - cyclone ascent
       - maritime convection
       - moist disturbed air

       It should now be easy to find precipitation.
    ========================================================= */

    function precipitationField(
        latitude,
        longitude,
        date,
        pressureValue,
        moisture,
        structure,
        temperature,
        landFraction,
        sst,
        cloud
    ) {
        if (
            averageMode
        ) {
            return {
                potential:
                    0,

                chance:
                    0,

                intensity:
                    0,

                precipitating:
                    false,

                mechanism:
                    "none"
            };
        }

        var noise =
            multiScaleNoise(
                latitude,
                longitude,
                date
            );

        /*
         * 1. Frontal precipitation
         */

        var frontal =
            structure.front *
            moisture *
            (
                0.75 +
                cloud *
                0.40
            );

        /*
         * 2. General cyclone ascent
         */

        var lowPressureLift =
            clamp(
                (
                    1017 -
                    pressureValue
                ) /
                13,
                0,
                1
            );

        var cyclone =
            structure.lowInfluence *
            moisture *
            lowPressureLift *
            0.85;

        /*
         * 3. Cold air over warmer sea / showers
         */

        var instability =
            clamp(
                (
                    sst -
                    temperature -
                    1
                ) /
                9,
                0,
                1
            );

        var maritimeShowers =
            instability *
            moisture *
            (
                1 -
                landFraction *
                0.65
            ) *
            smoothstep(
                0.40,
                0.72,
                noise
            ) *
            0.85;

        /*
         * 4. Disturbed moist air close to a depression.
         */

        var disturbed =
            moisture *
            structure.lowInfluence *
            smoothstep(
                0.55,
                0.82,
                noise
            ) *
            0.50;

        var potential =
            Math.max(
                frontal,
                cyclone,
                maritimeShowers,
                disturbed
            );

        /*
         * Deliberately low threshold while calibrating.
         */

        var threshold =
            0.105;

        var precipitating =
            potential >
            threshold &&
            cloud >
            0.48;

        var intensity =
            0;

        if (
            precipitating
        ) {
            intensity =
                clamp(
                    (
                        potential -
                        threshold
                    ) /
                    0.50,
                    0.06,
                    1
                );
        }

        var chance =
            clamp(
                (
                    potential -
                    0.04
                ) /
                0.38,
                0,
                1
            );

        var mechanism =
            "none";

        if (
            precipitating
        ) {
            var best =
                frontal;

            mechanism =
                "frontal";

            if (
                cyclone >
                best
            ) {
                best =
                    cyclone;

                mechanism =
                    "cyclonic";
            }

            if (
                maritimeShowers >
                best
            ) {
                best =
                    maritimeShowers;

                mechanism =
                    "showers";
            }

            if (
                disturbed >
                best
            ) {
                mechanism =
                    "disturbed";
            }
        }

        return {
            potential:
                potential,

            chance:
                chance,

            intensity:
                intensity,

            precipitating:
                precipitating,

            mechanism:
                mechanism
        };
    }


    /* =========================================================
       PRECIPITATION PHASE

       Minecraft rule requested:
       <= 1.5 C snow
       <= 3.0 C sleet
       > 3.0 C rain
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

       Stronger than the previous implementation.
    ========================================================= */

    function advectionCorrection(
        latitude,
        longitude,
        date,
        wind,
        localMean
    ) {
        if (
            averageMode
        ) {
            return 0;
        }

        var upstream =
            upstreamPoint(
                latitude,
                longitude,
                wind
            );

        var upstreamNormal =
            interpolatedNormals(
                upstream.lat,
                upstream.lon,
                date
            );

        var upstreamMean =
            (
                upstreamNormal.high +
                upstreamNormal.low
            ) /
            2;

        var strength =
            clamp(
                wind.speedMs /
                14,
                0,
                0.82
            );

        var correction =
            (
                upstreamMean -
                localMean
            ) *
            strength;

        return clamp(
            correction,
            -10,
            10
        );
    }


    /* =========================================================
       MAIN SIMULATION
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

        var upstream =
            upstreamPoint(
                latitude,
                longitude,
                wind
            );

        var upstreamClimate =
            window.EuropaClimate.getIndices(
                upstream.lat,
                upstream.lon,
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

        var sst =
            seaSurfaceTemperature(
                latitude,
                longitude,
                d,
                climate
            );

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
         * Ocean cells approach SST.
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
                    0.20 +
                    wind.speedMs /
                    35,
                    0.20,
                    0.72
                );

            preliminaryTemperature =
                lerp(
                    preliminaryTemperature,
                    sst,
                    seaCoupling
                );
        }

        var structure =
            synopticStructure(
                latitude,
                longitude,
                d
            );

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
                latitude,
                longitude,
                d,
                pressureValue,
                moisture,
                structure,
                preliminaryTemperature,
                landFraction,
                sst
            );

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
         * Small synoptic thermal response.
         */

        if (
            !averageMode
        ) {
            temperature +=
                clamp(
                    (
                        pressureValue -
                        1015
                    ) *
                    0.025,
                    -1,
                    1
                );
        }

        /*
         * Final SST coupling over sea.
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
                    0.20 +
                    wind.speedMs /
                    35,
                    0.20,
                    0.72
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
                latitude,
                longitude,
                d,
                pressureValue,
                moisture,
                structure,
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
                32 +
                moisture *
                58 +
                cloud *
                10,
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

            averageMode:
                averageMode,

            regime:
                currentRegime(d).name,

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
                structure.front,

            cycloneInfluence:
                structure.lowInfluence,

            precipitationPotential:
                precipitation.potential,

            precipitationChance:
                precipitation.chance,

            precipitationIntensity:
                precipitation.intensity,

            precipitationMechanism:
                precipitation.mechanism,

            precipitationType:
                phase
        };
    }


    /* =========================================================
       MODE CONTROL
    ========================================================= */

    function setAverageMode(enabled) {
        averageMode =
            !!enabled;

        return averageMode;
    }

    function getAverageMode() {
        return averageMode;
    }

    function toggleAverageMode() {
        averageMode =
            !averageMode;

        return averageMode;
    }


    /* =========================================================
       PUBLIC API
    ========================================================= */

    window.EuropaWeather = {

        version:
            "4.0-regime-weather",

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
            interpolatedNormals,

        currentRegime:
            currentRegime,

        setAverageMode:
            setAverageMode,

        getAverageMode:
            getAverageMode,

        toggleAverageMode:
            toggleAverageMode
    };

    console.log(
        "EuropaCraft Weather Engine loaded:",
        window.EuropaWeather.version
    );

})();
