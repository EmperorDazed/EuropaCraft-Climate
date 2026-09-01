/*
 * EuropaCraft Atmospheric Simulation
 * V10 Terrain Engine
 *
 * Responsibilities:
 *
 * - Define the atmospheric physics grid geography.
 * - Store latitude, longitude, land fraction and elevation.
 * - Provide maritime / continental exposure diagnostics.
 * - Supply terrain gradients to the dynamics engine.
 * - Provide bilinear sampling and coordinate conversion.
 * - Accept exact external EuropaCraft terrain data later without
 *   requiring the atmospheric model to be rewritten.
 *
 * IMPORTANT:
 *
 * The built-in geography is a fallback approximation for development.
 * The architecture deliberately allows the real EuropaCraft land/elevation
 * raster to replace it later.
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-terrain.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-terrain.js"
        );
    }


    /* ================================================================
       BASIC HELPERS
    ================================================================ */

    function finite(
        value,
        fallback = 0
    ) {

        const number =
            Number(value);

        return (
            Number.isFinite(number)
                ? number
                : fallback
        );
    }


    function pointInPolygon(
        lon,
        lat,
        polygon
    ) {

        let inside =
            false;


        for (
            let i = 0,
                j = polygon.length - 1;
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
                    (
                        yi > lat
                    ) !==
                    (
                        yj > lat
                    )
                ) &&
                (
                    lon <
                    (
                        xj -
                        xi
                    ) *
                    (
                        lat -
                        yi
                    ) /
                    (
                        yj -
                        yi +
                        1e-12
                    ) +
                    xi
                );


            if (
                intersects
            ) {
                inside =
                    !inside;
            }
        }


        return inside;
    }


    function ellipse(
        lat,
        lon,
        centerLat,
        centerLon,
        radiusLat,
        radiusLon
    ) {

        const dy =
            (
                lat -
                centerLat
            ) /
            radiusLat;


        const dx =
            (
                lon -
                centerLon
            ) /
            radiusLon;


        return (
            dx * dx +
            dy * dy <=
            1
        );
    }


    function gaussianMountain(
        lat,
        lon,
        centerLat,
        centerLon,
        sigmaLat,
        sigmaLon,
        heightM
    ) {

        const dy =
            (
                lat -
                centerLat
            ) /
            sigmaLat;


        const dx =
            (
                lon -
                centerLon
            ) /
            sigmaLon;


        return (
            heightM *
            Math.exp(
                -0.5 *
                (
                    dx * dx +
                    dy * dy
                )
            )
        );
    }


    function ridgeMountain(
        lat,
        lon,
        startLat,
        startLon,
        endLat,
        endLon,
        widthKm,
        heightM
    ) {

        const distance =
            U.pointSegmentDistanceKm(
                lat,
                lon,
                startLat,
                startLon,
                endLat,
                endLon
            );


        return (
            heightM *
            U.gaussian(
                distance,
                widthKm
            )
        );
    }


    /* ================================================================
       FALLBACK EUROPEAN LAND GEOMETRY
    ================================================================ */

    const POLYGONS =
        Object.freeze({

            ireland: [
                [-10.8, 51.3],
                [-10.5, 53.7],
                [-9.2, 55.4],
                [-7.0, 55.4],
                [-5.4, 54.1],
                [-6.0, 52.0],
                [-8.0, 51.2]
            ],

            britain: [
                [-6.5, 49.7],
                [-5.3, 50.0],
                [-3.7, 50.3],
                [-1.0, 50.2],
                [1.8, 51.0],
                [1.3, 52.5],
                [0.0, 54.2],
                [-1.5, 55.8],
                [-3.0, 58.7],
                [-5.4, 58.5],
                [-6.2, 56.0],
                [-5.0, 53.5]
            ],

            iberia: [
                [-9.7, 36.0],
                [-7.3, 36.0],
                [-5.3, 36.2],
                [-1.8, 36.7],
                [0.5, 38.7],
                [3.3, 41.6],
                [2.3, 42.8],
                [-1.8, 43.7],
                [-5.8, 43.7],
                [-8.8, 42.0],
                [-9.6, 39.0]
            ],

            westernEurope: [
                [-4.8, 43.0],
                [-1.3, 43.1],
                [2.0, 42.8],
                [5.5, 43.2],
                [7.8, 44.0],
                [10.2, 45.5],
                [13.0, 46.3],
                [16.5, 47.0],
                [19.0, 47.3],
                [20.5, 49.2],
                [22.5, 51.0],
                [24.5, 54.5],
                [22.0, 56.5],
                [17.5, 55.5],
                [14.5, 54.3],
                [11.0, 54.5],
                [8.0, 55.2],
                [5.5, 53.7],
                [3.0, 51.4],
                [1.0, 50.8],
                [-1.8, 48.8],
                [-4.8, 48.0]
            ],

            easternEurope: [
                [18.0, 45.0],
                [24.0, 43.5],
                [30.0, 44.0],
                [35.0, 45.0],
                [39.0, 47.5],
                [43.0, 50.0],
                [50.0, 51.0],
                [52.0, 58.0],
                [49.0, 63.0],
                [39.0, 66.0],
                [31.0, 65.0],
                [25.0, 60.0],
                [22.0, 55.0],
                [20.0, 50.0]
            ],

            scandinavia: [
                [4.3, 57.5],
                [6.0, 60.0],
                [5.0, 62.8],
                [7.0, 66.5],
                [12.0, 70.5],
                [18.0, 71.5],
                [24.0, 70.5],
                [30.0, 69.0],
                [31.5, 65.0],
                [27.0, 61.0],
                [24.0, 58.0],
                [18.0, 56.0],
                [12.0, 56.0]
            ],

            italy: [
                [6.8, 44.8],
                [8.5, 46.2],
                [12.8, 46.6],
                [13.6, 44.8],
                [15.7, 41.9],
                [18.3, 40.0],
                [17.0, 38.7],
                [15.1, 39.4],
                [13.2, 42.1],
                [11.1, 43.3],
                [9.2, 44.0]
            ],

            balkans: [
                [13.2, 46.7],
                [18.0, 47.2],
                [22.0, 46.0],
                [27.5, 45.2],
                [29.5, 42.0],
                [27.0, 40.0],
                [24.5, 39.0],
                [22.5, 36.4],
                [20.0, 39.0],
                [18.0, 40.0],
                [16.0, 42.0],
                [14.0, 44.0]
            ],

            anatolia: [
                [25.5, 39.0],
                [27.0, 41.5],
                [31.0, 42.0],
                [36.0, 41.8],
                [41.5, 41.2],
                [44.5, 39.5],
                [43.0, 36.5],
                [37.0, 35.8],
                [31.0, 36.0],
                [27.0, 37.0]
            ],

            northAfrica: [
                [-12.0, 30.0],
                [52.0, 30.0],
                [52.0, 34.0],
                [45.0, 36.0],
                [36.0, 36.8],
                [28.0, 35.5],
                [22.0, 33.0],
                [13.0, 32.0],
                [5.0, 34.0],
                [-2.0, 35.8],
                [-7.0, 35.5]
            ],

            iceland: [
                [-24.7, 63.3],
                [-22.0, 63.2],
                [-18.0, 63.4],
                [-13.2, 64.5],
                [-13.8, 66.2],
                [-18.0, 66.7],
                [-23.0, 66.2],
                [-24.8, 64.8]
            ],

            greenlandEdge: [
                [-26.0, 67.5],
                [-22.0, 68.5],
                [-19.0, 71.0],
                [-18.0, 74.0],
                [-26.0, 74.0]
            ]
        });


    function fallbackLandBoolean(
        lat,
        lon
    ) {

        let land =
            false;


        for (
            const polygon of Object.values(
                POLYGONS
            )
        ) {

            if (
                pointInPolygon(
                    lon,
                    lat,
                    polygon
                )
            ) {

                land =
                    true;

                break;
            }
        }


        /*
         * Islands omitted from the broad polygons.
         */

        if (
            ellipse(
                lat,
                lon,
                40.0,
                9.0,
                1.7,
                1.2
            )
        ) {
            land = true; // Sardinia
        }


        if (
            ellipse(
                lat,
                lon,
                42.1,
                9.1,
                1.1,
                0.65
            )
        ) {
            land = true; // Corsica
        }


        if (
            ellipse(
                lat,
                lon,
                37.6,
                14.1,
                1.3,
                2.4
            )
        ) {
            land = true; // Sicily
        }


        if (
            ellipse(
                lat,
                lon,
                35.2,
                24.8,
                0.6,
                3.1
            )
        ) {
            land = true; // Crete
        }


        if (
            ellipse(
                lat,
                lon,
                35.1,
                33.2,
                0.7,
                1.4
            )
        ) {
            land = true; // Cyprus
        }


        if (
            ellipse(
                lat,
                lon,
                54.8,
                11.8,
                1.4,
                1.9
            )
        ) {
            land = true; // Denmark
        }


        /*
         * ============================================================
         * SEA CUT-OUTS
         * ============================================================
         */


        /*
         * Baltic proper.
         */

        if (
            ellipse(
                lat,
                lon,
                57.5,
                19.0,
                3.1,
                4.0
            )
        ) {
            land = false;
        }


        /*
         * Gulf of Bothnia.
         */

        if (
            ellipse(
                lat,
                lon,
                63.4,
                20.5,
                3.0,
                2.2
            )
        ) {
            land = false;
        }


        /*
         * Gulf of Finland.
         */

        if (
            ellipse(
                lat,
                lon,
                59.8,
                26.0,
                0.75,
                4.2
            )
        ) {
            land = false;
        }


        /*
         * Black Sea.
         */

        if (
            ellipse(
                lat,
                lon,
                43.2,
                34.0,
                3.2,
                7.2
            )
        ) {
            land = false;
        }


        /*
         * Sea of Azov.
         */

        if (
            ellipse(
                lat,
                lon,
                46.1,
                36.3,
                1.2,
                2.4
            )
        ) {
            land = false;
        }


        /*
         * Caspian Sea.
         */

        if (
            ellipse(
                lat,
                lon,
                42.0,
                50.2,
                5.9,
                3.0
            )
        ) {
            land = false;
        }


        /*
         * Adriatic Sea.
         */

        if (
            ellipse(
                lat,
                lon,
                43.2,
                15.5,
                3.6,
                1.4
            )
        ) {
            land = false;
        }


        /*
         * Aegean Sea with Greek land remaining around the edges.
         */

        if (
            ellipse(
                lat,
                lon,
                38.5,
                25.0,
                2.2,
                2.0
            )
        ) {
            land = false;
        }


        return land;
    }


    /* ================================================================
       FRACTIONAL COASTLINES
    ================================================================ */

    function fallbackLandFraction(
        lat,
        lon,
        latSpacing,
        lonSpacing
    ) {

        /*
         * Five-point supersampling gives coastal cells a fractional
         * land value rather than an abrupt binary coastline.
         */

        const offsets = [
            [0, 0],
            [-0.32, -0.32],
            [0.32, -0.32],
            [-0.32, 0.32],
            [0.32, 0.32]
        ];


        let landCount =
            0;


        for (
            const offset of offsets
        ) {

            const sampleLat =
                lat +
                offset[1] *
                latSpacing;


            const sampleLon =
                lon +
                offset[0] *
                lonSpacing;


            if (
                fallbackLandBoolean(
                    sampleLat,
                    sampleLon
                )
            ) {
                landCount++;
            }
        }


        return (
            landCount /
            offsets.length
        );
    }


    /* ================================================================
       FALLBACK ELEVATION
    ================================================================ */

    function fallbackAltitude(
        lat,
        lon,
        landFraction
    ) {

        if (
            landFraction <=
            0.05
        ) {
            return 0;
        }


        /*
         * Broad lowland background.
         */

        let altitude =
            65;


        /*
         * Small deterministic terrain texture.
         *
         * This is not random per timestep and therefore cannot generate
         * weather noise.
         */

        altitude +=
            35 *
            Math.sin(
                (
                    lat *
                    2.7 +
                    lon *
                    1.8
                ) *
                U.DEG
            );


        altitude +=
            22 *
            Math.sin(
                (
                    lat *
                    5.1 -
                    lon *
                    3.4
                ) *
                U.DEG
            );


        /* ------------------------------------------------------------
           MAJOR EUROPEAN MOUNTAIN SYSTEMS
        ------------------------------------------------------------ */

        // Alps
        altitude +=
            ridgeMountain(
                lat,
                lon,
                46.3,
                5.5,
                47.1,
                15.8,
                85,
                2350
            );


        // Pyrenees
        altitude +=
            ridgeMountain(
                lat,
                lon,
                42.7,
                -1.8,
                42.6,
                2.8,
                55,
                1850
            );


        // Cantabrian Mountains
        altitude +=
            ridgeMountain(
                lat,
                lon,
                43.0,
                -7.5,
                42.8,
                -2.0,
                70,
                900
            );


        // Iberian interior
        altitude +=
            gaussianMountain(
                lat,
                lon,
                40.5,
                -3.5,
                2.5,
                3.8,
                650
            );


        // Scandinavian Mountains
        altitude +=
            ridgeMountain(
                lat,
                lon,
                59.0,
                7.0,
                69.5,
                19.0,
                110,
                1450
            );


        // Scottish Highlands
        altitude +=
            gaussianMountain(
                lat,
                lon,
                57.1,
                -4.7,
                1.2,
                1.7,
                800
            );


        // Welsh uplands
        altitude +=
            gaussianMountain(
                lat,
                lon,
                52.8,
                -3.6,
                0.8,
                0.9,
                500
            );


        // Carpathians
        altitude +=
            ridgeMountain(
                lat,
                lon,
                49.3,
                19.0,
                46.0,
                25.5,
                95,
                1450
            );


        // Dinaric Alps
        altitude +=
            ridgeMountain(
                lat,
                lon,
                46.0,
                14.5,
                42.0,
                20.0,
                75,
                1350
            );


        // Balkan Mountains
        altitude +=
            ridgeMountain(
                lat,
                lon,
                43.2,
                22.0,
                42.7,
                28.0,
                75,
                900
            );


        // Apennines
        altitude +=
            ridgeMountain(
                lat,
                lon,
                44.0,
                10.0,
                39.0,
                16.5,
                60,
                1050
            );


        // Pindus / Greece
        altitude +=
            ridgeMountain(
                lat,
                lon,
                40.5,
                20.5,
                37.5,
                22.5,
                65,
                1050
            );


        // Anatolian plateau
        altitude +=
            gaussianMountain(
                lat,
                lon,
                39.0,
                34.0,
                2.6,
                6.0,
                900
            );


        // Pontic Mountains
        altitude +=
            ridgeMountain(
                lat,
                lon,
                40.7,
                29.0,
                40.8,
                42.0,
                75,
                1250
            );


        // Taurus Mountains
        altitude +=
            ridgeMountain(
                lat,
                lon,
                37.1,
                29.0,
                37.5,
                40.0,
                75,
                1550
            );


        // Caucasus
        altitude +=
            ridgeMountain(
                lat,
                lon,
                42.5,
                39.0,
                42.0,
                48.0,
                70,
                2850
            );


        // Atlas
        altitude +=
            ridgeMountain(
                lat,
                lon,
                32.0,
                -8.5,
                35.5,
                8.0,
                120,
                1700
            );


        // Iceland central highlands
        altitude +=
            gaussianMountain(
                lat,
                lon,
                64.8,
                -18.5,
                1.7,
                3.4,
                1150
            );


        // Greenland edge
        altitude +=
            gaussianMountain(
                lat,
                lon,
                72.0,
                -23.0,
                3.0,
                4.0,
                1850
            );


        /*
         * Avoid improbable mountains over fractional coastal water.
         */

        altitude *=
            U.smoothstep(
                0.08,
                0.75,
                landFraction
            );


        return U.clamp(
            altitude,
            0,
            4500
        );
    }


    /* ================================================================
       MARITIME / CONTINENTAL EXPOSURE
    ================================================================ */

    function fallbackExposure(
        lat,
        lon,
        landFraction
    ) {

        /*
         * Broad first approximation when the climate module does not
         * provide source indices.
         */

        if (
            landFraction <
            0.5
        ) {

            return {
                maritime: 1,
                continental: 0
            };
        }


        const westernMaritime =
            U.clamp01(
                1 -
                (
                    lon +
                    8
                ) /
                35
            );


        const mediterraneanMaritime =
            U.gaussian(
                U.haversineKm(
                    lat,
                    lon,
                    39,
                    16
                ),
                900
            );


        const northSeaMaritime =
            U.gaussian(
                U.haversineKm(
                    lat,
                    lon,
                    55,
                    4
                ),
                700
            );


        const maritime =
            U.clamp01(
                Math.max(
                    westernMaritime *
                        0.75,
                    mediterraneanMaritime *
                        0.65,
                    northSeaMaritime *
                        0.75
                )
            );


        return {

            maritime,

            continental:
                U.clamp01(
                    1 -
                    maritime
                )
        };
    }


    /* ================================================================
       TERRAIN CLASS
    ================================================================ */

    class Terrain {

        constructor(
            options = {}
        ) {

            this.nx =
                Number.isInteger(
                    options.nx
                )
                    ? options.nx
                    : C.grid.nx;


            this.ny =
                Number.isInteger(
                    options.ny
                )
                    ? options.ny
                    : C.grid.ny;


            this.n =
                this.nx *
                this.ny;


            this.bounds = {

                west:
                    finite(
                        options.west,
                        C.bounds.west
                    ),

                east:
                    finite(
                        options.east,
                        C.bounds.east
                    ),

                south:
                    finite(
                        options.south,
                        C.bounds.south
                    ),

                north:
                    finite(
                        options.north,
                        C.bounds.north
                    )
            };


            this.lonSpacing =
                (
                    this.bounds.east -
                    this.bounds.west
                ) /
                Math.max(
                    1,
                    this.nx - 1
                );


            this.latSpacing =
                (
                    this.bounds.north -
                    this.bounds.south
                ) /
                Math.max(
                    1,
                    this.ny - 1
                );


            /*
             * Grid coordinates.
             *
             * y = 0 is NORTH.
             * y increases southward.
             *
             * This convention matches the derivative functions used by
             * the V10 physics engine.
             */

            this.lat =
                new Float32Array(
                    this.n
                );


            this.lon =
                new Float32Array(
                    this.n
                );


            this.land =
                new Float32Array(
                    this.n
                );


            this.altitudeM =
                new Float32Array(
                    this.n
                );


            this.maritime =
                new Float32Array(
                    this.n
                );


            this.continental =
                new Float32Array(
                    this.n
                );


            /*
             * Additional terrain diagnostics.
             */

            this.slopeEast =
                new Float32Array(
                    this.n
                );


            this.slopeNorth =
                new Float32Array(
                    this.n
                );


            this.slopeMagnitude =
                new Float32Array(
                    this.n
                );


            /*
             * Marks whether the development fallback or external exact
             * EuropaCraft terrain is currently installed.
             */

            this.source =
                "fallback-v10";


            this.initializeCoordinates();


            if (
                options.land &&
                options.altitudeM
            ) {

                this.installExternalTerrain(
                    options
                );
            }
            else {

                this.generateFallbackTerrain();
            }
        }


        /* ============================================================
           COORDINATES
        ============================================================ */

        initializeCoordinates() {

            for (
                let y = 0;
                y < this.ny;
                y++
            ) {

                const latitude =
                    U.lerp(
                        this.bounds.north,
                        this.bounds.south,
                        y /
                        Math.max(
                            1,
                            this.ny - 1
                        )
                    );


                for (
                    let x = 0;
                    x < this.nx;
                    x++
                ) {

                    const longitude =
                        U.lerp(
                            this.bounds.west,
                            this.bounds.east,
                            x /
                            Math.max(
                                1,
                                this.nx - 1
                            )
                        );


                    const cell =
                        y *
                        this.nx +
                        x;


                    this.lat[
                        cell
                    ] =
                        latitude;


                    this.lon[
                        cell
                    ] =
                        longitude;
                }
            }
        }


        xyFromLatLon(
            latitude,
            longitude
        ) {

            const x =
                (
                    longitude -
                    this.bounds.west
                ) /
                (
                    this.bounds.east -
                    this.bounds.west
                ) *
                (
                    this.nx -
                    1
                );


            const y =
                (
                    this.bounds.north -
                    latitude
                ) /
                (
                    this.bounds.north -
                    this.bounds.south
                ) *
                (
                    this.ny -
                    1
                );


            return {

                x:
                    U.clamp(
                        x,
                        0,
                        this.nx - 1
                    ),

                y:
                    U.clamp(
                        y,
                        0,
                        this.ny - 1
                    )
            };
        }


        latLonFromXY(
            x,
            y
        ) {

            return {

                lat:
                    U.lerp(
                        this.bounds.north,
                        this.bounds.south,
                        U.clamp(
                            y,
                            0,
                            this.ny - 1
                        ) /
                        Math.max(
                            1,
                            this.ny - 1
                        )
                    ),

                lon:
                    U.lerp(
                        this.bounds.west,
                        this.bounds.east,
                        U.clamp(
                            x,
                            0,
                            this.nx - 1
                        ) /
                        Math.max(
                            1,
                            this.nx - 1
                        )
                    )
            };
        }


        nearestIndex(
            latitude,
            longitude
        ) {

            const position =
                this.xyFromLatLon(
                    latitude,
                    longitude
                );


            const x =
                Math.round(
                    position.x
                );


            const y =
                Math.round(
                    position.y
                );


            return (
                y *
                this.nx +
                x
            );
        }


        /* ============================================================
           FALLBACK GENERATION
        ============================================================ */

        generateFallbackTerrain() {

            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const latitude =
                    this.lat[
                        cell
                    ];


                const longitude =
                    this.lon[
                        cell
                    ];


                const landFraction =
                    fallbackLandFraction(
                        latitude,
                        longitude,
                        this.latSpacing,
                        this.lonSpacing
                    );


                this.land[
                    cell
                ] =
                    landFraction;


                this.altitudeM[
                    cell
                ] =
                    fallbackAltitude(
                        latitude,
                        longitude,
                        landFraction
                    );
            }


            this.recalculateExposure();

            this.recalculateSlopes();

            this.source =
                "fallback-v10";
        }


        /* ============================================================
           EXTERNAL EUROPAcraft TERRAIN
        ============================================================ */

        installExternalTerrain(
            data
        ) {

            if (
                !data ||
                !data.land ||
                !data.altitudeM
            ) {

                throw new Error(
                    "EuropaCraft V10 Terrain: external terrain requires land and altitudeM arrays."
                );
            }


            if (
                data.land.length !==
                    this.n ||
                data.altitudeM.length !==
                    this.n
            ) {

                throw new Error(
                    "EuropaCraft V10 Terrain: external arrays must contain exactly " +
                    this.n +
                    " cells."
                );
            }


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                this.land[
                    cell
                ] =
                    U.clamp01(
                        finite(
                            data.land[
                                cell
                            ],
                            0
                        )
                    );


                this.altitudeM[
                    cell
                ] =
                    U.clamp(
                        finite(
                            data.altitudeM[
                                cell
                            ],
                            0
                        ),
                        0,
                        9000
                    );
            }


            if (
                data.maritime &&
                data.maritime.length ===
                    this.n
            ) {

                for (
                    let cell = 0;
                    cell < this.n;
                    cell++
                ) {

                    this.maritime[
                        cell
                    ] =
                        U.clamp01(
                            finite(
                                data.maritime[
                                    cell
                                ],
                                0
                            )
                        );
                }
            }


            if (
                data.continental &&
                data.continental.length ===
                    this.n
            ) {

                for (
                    let cell = 0;
                    cell < this.n;
                    cell++
                ) {

                    this.continental[
                        cell
                    ] =
                        U.clamp01(
                            finite(
                                data.continental[
                                    cell
                                ],
                                0
                            )
                        );
                }
            }


            if (
                !data.maritime ||
                !data.continental
            ) {

                this.recalculateExposure();
            }


            this.recalculateSlopes();


            this.source =
                String(
                    data.source ||
                    "external"
                );


            return this;
        }


        /* ============================================================
           EXPOSURE
        ============================================================ */

        recalculateExposure() {

            const climate =
                global.EuropaClimate;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const latitude =
                    this.lat[
                        cell
                    ];


                const longitude =
                    this.lon[
                        cell
                    ];


                const landFraction =
                    this.land[
                        cell
                    ];


                const altitude =
                    this.altitudeM[
                        cell
                    ];


                let maritime =
                    null;

                let continental =
                    null;


                if (
                    climate &&
                    typeof climate.getIndices ===
                        "function"
                ) {

                    try {

                        const result =
                            climate.getIndices(
                                latitude,
                                longitude,
                                {
                                    landFraction,

                                    altitudeM:
                                        altitude
                                }
                            );


                        const indices =
                            result &&
                            result.indices
                                ? result.indices
                                : result;


                        if (
                            indices &&
                            Number.isFinite(
                                Number(
                                    indices.maritime
                                )
                            )
                        ) {

                            maritime =
                                U.clamp01(
                                    Number(
                                        indices.maritime
                                    )
                                );
                        }


                        if (
                            indices &&
                            Number.isFinite(
                                Number(
                                    indices.continental
                                )
                            )
                        ) {

                            continental =
                                U.clamp01(
                                    Number(
                                        indices.continental
                                    )
                                );
                        }
                    }
                    catch (error) {

                        maritime =
                            null;

                        continental =
                            null;
                    }
                }


                if (
                    maritime === null ||
                    continental === null
                ) {

                    const fallback =
                        fallbackExposure(
                            latitude,
                            longitude,
                            landFraction
                        );


                    maritime =
                        fallback.maritime;

                    continental =
                        fallback.continental;
                }


                if (
                    landFraction <
                    0.5
                ) {

                    maritime =
                        Math.max(
                            maritime,
                            0.92
                        );


                    continental =
                        Math.min(
                            continental,
                            0.08
                        );
                }


                this.maritime[
                    cell
                ] =
                    U.clamp01(
                        maritime
                    );


                this.continental[
                    cell
                ] =
                    U.clamp01(
                        continental
                    );
            }
        }


        /* ============================================================
           TERRAIN GRADIENTS
        ============================================================ */

        recalculateSlopes() {

            for (
                let y = 0;
                y < this.ny;
                y++
            ) {

                for (
                    let x = 0;
                    x < this.nx;
                    x++
                ) {

                    const cell =
                        y *
                        this.nx +
                        x;


                    const dxKm =
                        this.lonSpacing *
                        U.kmPerDegreeLongitude(
                            this.lat[
                                cell
                            ]
                        );


                    const dyKm =
                        this.latSpacing *
                        U.kmPerDegreeLatitude(
                            this.lat[
                                cell
                            ]
                        );


                    const gradient =
                        U.gradient2D(
                            this.altitudeM,
                            this.nx,
                            this.ny,
                            x,
                            y,
                            dxKm,
                            dyKm
                        );


                    this.slopeEast[
                        cell
                    ] =
                        gradient.dx;


                    this.slopeNorth[
                        cell
                    ] =
                        gradient.dy;


                    this.slopeMagnitude[
                        cell
                    ] =
                        Math.hypot(
                            gradient.dx,
                            gradient.dy
                        );
                }
            }
        }


        /* ============================================================
           SAMPLING
        ============================================================ */

        sampleArray(
            array,
            latitude,
            longitude
        ) {

            const position =
                this.xyFromLatLon(
                    latitude,
                    longitude
                );


            return U.bilinear(
                array,
                this.nx,
                this.ny,
                position.x,
                position.y
            );
        }


        sample(
            latitude,
            longitude
        ) {

            const landFraction =
                U.clamp01(
                    this.sampleArray(
                        this.land,
                        latitude,
                        longitude
                    )
                );


            const altitudeM =
                Math.max(
                    0,
                    this.sampleArray(
                        this.altitudeM,
                        latitude,
                        longitude
                    )
                );


            const maritime =
                U.clamp01(
                    this.sampleArray(
                        this.maritime,
                        latitude,
                        longitude
                    )
                );


            const continental =
                U.clamp01(
                    this.sampleArray(
                        this.continental,
                        latitude,
                        longitude
                    )
                );


            return {

                lat:
                    latitude,

                lon:
                    longitude,

                landFraction,

                isLand:
                    landFraction >=
                    0.5,

                altitudeM,

                maritime,

                continental,

                slopeEastMPerKm:
                    this.sampleArray(
                        this.slopeEast,
                        latitude,
                        longitude
                    ),

                slopeNorthMPerKm:
                    this.sampleArray(
                        this.slopeNorth,
                        latitude,
                        longitude
                    ),

                slopeMagnitudeMPerKm:
                    Math.max(
                        0,
                        this.sampleArray(
                            this.slopeMagnitude,
                            latitude,
                            longitude
                        )
                    ),

                source:
                    this.source
            };
        }


        /* ============================================================
           DIAGNOSTICS
        ============================================================ */

        diagnosticsAtIndex(
            cell
        ) {

            if (
                cell < 0 ||
                cell >=
                    this.n
            ) {
                return null;
            }


            return {

                lat:
                    this.lat[
                        cell
                    ],

                lon:
                    this.lon[
                        cell
                    ],

                landFraction:
                    this.land[
                        cell
                    ],

                altitudeM:
                    this.altitudeM[
                        cell
                    ],

                maritime:
                    this.maritime[
                        cell
                    ],

                continental:
                    this.continental[
                        cell
                    ],

                slopeEastMPerKm:
                    this.slopeEast[
                        cell
                    ],

                slopeNorthMPerKm:
                    this.slopeNorth[
                        cell
                    ],

                slopeMagnitudeMPerKm:
                    this.slopeMagnitude[
                        cell
                    ],

                source:
                    this.source
            };
        }


        diagnosticsAt(
            latitude,
            longitude
        ) {

            return this.diagnosticsAtIndex(
                this.nearestIndex(
                    latitude,
                    longitude
                )
            );
        }


        /* ============================================================
           VALIDATION
        ============================================================ */

        validate() {

            U.assertFiniteArray(
                this.lat,
                "terrain latitude"
            );


            U.assertFiniteArray(
                this.lon,
                "terrain longitude"
            );


            U.assertFiniteArray(
                this.land,
                "terrain land fraction"
            );


            U.assertFiniteArray(
                this.altitudeM,
                "terrain altitude"
            );


            U.assertFiniteArray(
                this.maritime,
                "terrain maritime index"
            );


            U.assertFiniteArray(
                this.continental,
                "terrain continental index"
            );


            U.assertFiniteArray(
                this.slopeEast,
                "terrain east slope"
            );


            U.assertFiniteArray(
                this.slopeNorth,
                "terrain north slope"
            );


            return true;
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaTerrain =
        Object.freeze({

            Terrain,

            fallbackLandFraction,

            fallbackAltitude,

            fallbackExposure
        });

})(window);
