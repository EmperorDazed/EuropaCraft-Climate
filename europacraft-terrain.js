/* ============================================================================
   EuropaCraft Weather Simulator
   Terrain and Geography Model
   Version 7.2

   NEW FILE

   PURPOSE

   Provides the static geographical surface used by the weather simulator.

   Current version uses a procedural approximation of European geography.

   It provides:

       - land / sea fraction
       - latitude / longitude grid
       - approximate elevation
       - mountain barriers
       - distance to sea
       - distance to land
       - maritime influence
       - continental influence
       - bilinear geographical sampling

   IMPORTANT

   This is NOT the final EuropaCraft raster terrain.

   It is a geographically informed procedural surface suitable for getting the
   atmosphere operational before exact map/elevation rasters are integrated.
============================================================================ */

(function (global) {
"use strict";


const U = global.EuropaUtils;
const C = global.EuropaConfig;


/* ============================================================================
   HELPERS
============================================================================ */

function ellipse(
    lat,
    lon,
    centreLat,
    centreLon,
    radiusLat,
    radiusLon
) {

    const y = (

        (
            lat -
            centreLat
        ) /
        radiusLat
    );


    const x = (

        (
            lon -
            centreLon
        ) /
        radiusLon
    );


    const d = Math.sqrt(

        x *
        x +

        y *
        y
    );


    return U.clamp(

        1 -
        U.smoothstep(
            0.82,
            1.05,
            d
        ),

        0,

        1
    );
}


function addLand(
    current,
    amount
) {

    return Math.max(
        current,
        amount
    );
}


function carveSea(
    current,
    amount
) {

    return (

        current *
        (
            1 -
            U.clamp(
                amount,
                0,
                1
            )
        )
    );
}


/* ============================================================================
   PROCEDURAL LAND MASK
============================================================================ */

function proceduralLandFraction(
    lat,
    lon
) {

    let land = (
        0
    );


    /* ========================================================================
       IBERIA
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            40.2,
            -3.8,
            4.6,
            6.2
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            42.3,
            -7.0,
            2.6,
            3.0
        )
    );


    /* ========================================================================
       FRANCE / BENELUX
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            47.0,
            2.2,
            4.7,
            6.8
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            50.7,
            4.7,
            2.4,
            3.9
        )
    );


    /* ========================================================================
       CENTRAL EUROPE
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            51.2,
            11.0,
            4.5,
            7.7
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            52.4,
            19.2,
            4.4,
            7.3
        )
    );


    /* ========================================================================
       EASTERN EUROPE
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            52.0,
            29.5,
            8.4,
            11.5
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            57.0,
            40.5,
            10.0,
            12.7
        )
    );


    /* ========================================================================
       BALKANS
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            44.0,
            21.0,
            4.6,
            5.8
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            41.0,
            23.0,
            3.6,
            5.0
        )
    );


    /* ========================================================================
       ITALY
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            44.8,
            10.6,
            2.3,
            3.5
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            42.0,
            12.6,
            4.6,
            1.7
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            39.0,
            16.1,
            2.5,
            1.4
        )
    );


    /* ========================================================================
       ANATOLIA
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            39.1,
            32.5,
            3.9,
            9.6
        )
    );


    /* ========================================================================
       GREAT BRITAIN
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            53.6,
            -1.8,
            4.8,
            2.5
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            57.0,
            -4.1,
            2.9,
            2.5
        )
    );


    /* ========================================================================
       IRELAND
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            53.3,
            -8.0,
            2.9,
            2.8
        )
    );


    /* ========================================================================
       DENMARK
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            56.0,
            9.4,
            2.0,
            1.5
        )
    );


    /* ========================================================================
       SCANDINAVIA
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            62.0,
            14.0,
            7.7,
            4.6
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            67.4,
            18.5,
            6.7,
            5.2
        )
    );


    /* ========================================================================
       FINLAND
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            63.5,
            26.0,
            6.5,
            5.7
        )
    );


    /* ========================================================================
       ICELAND
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            64.9,
            -18.6,
            2.0,
            3.7
        )
    );


    /* ========================================================================
       MEDITERRANEAN ISLANDS
       ======================================================================== */

    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            40.0,
            9.0,
            2.2,
            1.4
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            37.6,
            14.0,
            1.7,
            2.4
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            39.6,
            3.0,
            1.4,
            2.2
        )
    );


    land = addLand(

        land,

        ellipse(
            lat,
            lon,
            35.2,
            24.8,
            1.2,
            4.7
        )
    );


    /* ========================================================================
       SEA CARVING
       ======================================================================== */


    /* North Sea */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            56.0,
            2.5,
            4.2,
            4.9
        ) *
        0.92
    );


    /* Baltic */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            58.3,
            19.0,
            4.7,
            5.8
        ) *
        0.92
    );


    /* Gulf of Bothnia */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            63.3,
            20.5,
            4.7,
            2.7
        ) *
        0.88
    );


    /* English Channel */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            50.2,
            -1.2,
            0.95,
            5.0
        ) *
        0.90
    );


    /* Irish Sea */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            54.5,
            -4.5,
            1.8,
            1.5
        ) *
        0.95
    );


    /* Bay of Biscay */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            45.0,
            -5.2,
            3.5,
            4.2
        ) *
        0.70
    );


    /* Mediterranean */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            37.5,
            12.0,
            4.9,
            17.0
        ) *
        0.80
    );


    /* Adriatic */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            43.5,
            15.2,
            3.7,
            1.4
        ) *
        0.95
    );


    /* Ionian */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            38.5,
            18.0,
            3.4,
            3.0
        ) *
        0.85
    );


    /* Aegean */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            38.5,
            25.0,
            3.7,
            3.2
        ) *
        0.92
    );


    /* Black Sea */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            43.2,
            34.2,
            3.4,
            7.0
        ) *
        0.98
    );


    /* Sea of Azov */

    land = carveSea(

        land,

        ellipse(
            lat,
            lon,
            46.2,
            36.5,
            1.5,
            2.4
        ) *
        0.95
    );


    /* ========================================================================
       COAST SHARPENING
       ======================================================================== */

    land = U.smoothstep(
        0.20,
        0.72,
        land
    );


    return U.clamp(
        land,
        0,
        1
    );
}


/* ============================================================================
   ELEVATION
============================================================================ */

function mountainContribution(
    lat,
    lon,
    mountain
) {

    const dy = (

        (
            lat -
            mountain.lat
        ) /

        Math.max(
            0.1,
            mountain.sigmaLat
        )
    );


    const dx = (

        (
            lon -
            mountain.lon
        ) /

        Math.max(
            0.1,
            mountain.sigmaLon
        )
    );


    return (

        mountain.heightM *

        Math.exp(

            -0.5 *

            (
                dx *
                dx +

                dy *
                dy
            )
        )
    );
}


function approximateAltitude(
    lat,
    lon,
    land
) {

    if (
        land <
        0.05
    ) {

        return 0;
    }


    const terrainConfig = (
        C.terrain ||
        {}
    );


    let altitude = (

        Number(
            terrainConfig.lowlandBaseM
        ) ||
        65
    );


    const mountains = (
        Array.isArray(
            terrainConfig.mountains
        )
            ? terrainConfig.mountains
            : []
    );


    for (
        const mountain
        of mountains
    ) {

        altitude += (
            mountainContribution(
                lat,
                lon,
                mountain
            )
        );
    }


    /* ========================================================================
       DETERMINISTIC LOW-AMPLITUDE TERRAIN DETAIL

       Geography only — not weather noise.
       ======================================================================== */

    const roughnessAmplitude = (

        Number(
            terrainConfig.roughnessAmplitudeM
        ) ||
        85
    );


    const roughnessScale = (

        Number(
            terrainConfig.roughnessScale
        ) ||
        0.085
    );


    const noise = (
        U.valueNoise2D(

            (
                lon +
                40
            ) /
            Math.max(
                0.01,
                roughnessScale *
                25
            ),

            (
                lat -
                20
            ) /
            Math.max(
                0.01,
                roughnessScale *
                25
            ),

            731
        )
    );


    altitude += (

        (
            noise -
            0.5
        ) *

        roughnessAmplitude
    );


    altitude *= (
        land
    );


    return U.clamp(

        altitude,

        0,

        Number(
            terrainConfig.maxAltitudeM
        ) ||
        3600
    );
}


/* ============================================================================
   TERRAIN CLASS
============================================================================ */

class EuropaTerrain {

    constructor() {

        this.nx = (

            Number(
                C.grid.nx
            ) ||
            195
        );


        this.ny = (

            Number(
                C.grid.ny
            ) ||
            110
        );


        this.n = (

            this.nx *
            this.ny
        );


        /* ====================================================================
           PRIMARY FIELDS
           ==================================================================== */

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


        this.distanceToSeaKm =
            new Float32Array(
                this.n
            );


        this.distanceToLandKm =
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


        this._buildCoordinates();

        this._buildSurface();

        this._calculateDistances();

        this._calculateIndices();
    }


    /* ========================================================================
       COORDINATES

       Row 0 is NORTH.
       ======================================================================== */

    _buildCoordinates() {

        for (
            let y = 0;
            y <
            this.ny;
            y++
        ) {

            const fy = (

                y /

                Math.max(
                    1,
                    this.ny - 1
                )
            );


            const lat = U.lerp(

                C.bounds.north,

                C.bounds.south,

                fy
            );


            for (
                let x = 0;
                x <
                this.nx;
                x++
            ) {

                const fx = (

                    x /

                    Math.max(
                        1,
                        this.nx - 1
                    )
                );


                const lon = U.lerp(

                    C.bounds.west,

                    C.bounds.east,

                    fx
                );


                const i = (

                    y *
                    this.nx +
                    x
                );


                this.lat[i] = (
                    lat
                );


                this.lon[i] = (
                    lon
                );
            }
        }
    }


    /* ========================================================================
       LAND / ELEVATION
       ======================================================================== */

    _buildSurface() {

        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            const lat = (
                this.lat[i]
            );


            const lon = (
                this.lon[i]
            );


            const land = (
                proceduralLandFraction(
                    lat,
                    lon
                )
            );


            this.land[i] = (
                land
            );


            this.altitudeM[i] = (
                approximateAltitude(
                    lat,
                    lon,
                    land
                )
            );
        }
    }


    /* ========================================================================
       APPROXIMATE DISTANCE TO OPPOSITE SURFACE

       Multi-pass neighbour propagation.

       Good enough for maritime/continental weighting at this physics
       resolution and considerably cheaper than all-to-all distance tests.
       ======================================================================== */

    _calculateDistances() {

        const huge = (
            100000
        );


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            const land = (

                this.land[i] >=
                0.5
            );


            this.distanceToSeaKm[i] = (

                land
                    ? huge
                    : 0
            );


            this.distanceToLandKm[i] = (

                land
                    ? 0
                    : huge
            );
        }


        /*
         * Repeated local relaxation.
         */

        for (
            let pass = 0;
            pass <
            10;
            pass++
        ) {

            this._distancePass(
                this.distanceToSeaKm
            );


            this._distancePass(
                this.distanceToLandKm
            );
        }


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            if (
                this.distanceToSeaKm[i] >=
                huge *
                0.5
            ) {

                this.distanceToSeaKm[i] = (
                    1500
                );
            }


            if (
                this.distanceToLandKm[i] >=
                huge *
                0.5
            ) {

                this.distanceToLandKm[i] = (
                    1500
                );
            }
        }
    }


    _distancePass(
        field
    ) {

        /*
         * Forward.
         */

        for (
            let y = 0;
            y <
            this.ny;
            y++
        ) {

            const dyKm = (
                U.kmPerDegreeLatitude() *
                (
                    C.bounds.north -
                    C.bounds.south
                ) /
                Math.max(
                    1,
                    this.ny - 1
                )
            );


            const lat = (
                this.lat[
                    y *
                    this.nx
                ]
            );


            const dxKm = (

                U.kmPerDegreeLongitude(
                    lat
                ) *

                (
                    C.bounds.east -
                    C.bounds.west
                ) /

                Math.max(
                    1,
                    this.nx - 1
                )
            );


            for (
                let x = 0;
                x <
                this.nx;
                x++
            ) {

                const i = (

                    y *
                    this.nx +
                    x
                );


                let value = (
                    field[i]
                );


                if (
                    x > 0
                ) {

                    value = Math.min(

                        value,

                        field[
                            i - 1
                        ] +
                        dxKm
                    );
                }


                if (
                    y > 0
                ) {

                    value = Math.min(

                        value,

                        field[
                            i -
                            this.nx
                        ] +
                        dyKm
                    );
                }


                field[i] = (
                    value
                );
            }
        }


        /*
         * Reverse.
         */

        for (
            let y = this.ny - 1;
            y >= 0;
            y--
        ) {

            const dyKm = (

                U.kmPerDegreeLatitude() *

                (
                    C.bounds.north -
                    C.bounds.south
                ) /

                Math.max(
                    1,
                    this.ny - 1
                )
            );


            const lat = (
                this.lat[
                    y *
                    this.nx
                ]
            );


            const dxKm = (

                U.kmPerDegreeLongitude(
                    lat
                ) *

                (
                    C.bounds.east -
                    C.bounds.west
                ) /

                Math.max(
                    1,
                    this.nx - 1
                )
            );


            for (
                let x = this.nx - 1;
                x >= 0;
                x--
            ) {

                const i = (

                    y *
                    this.nx +
                    x
                );


                let value = (
                    field[i]
                );


                if (
                    x <
                    this.nx - 1
                ) {

                    value = Math.min(

                        value,

                        field[
                            i + 1
                        ] +
                        dxKm
                    );
                }


                if (
                    y <
                    this.ny - 1
                ) {

                    value = Math.min(

                        value,

                        field[
                            i +
                            this.nx
                        ] +
                        dyKm
                    );
                }


                field[i] = (
                    value
                );
            }
        }
    }


    /* ========================================================================
       MARITIME / CONTINENTAL INDICES
       ======================================================================== */

    _calculateIndices() {

        const coastInfluenceKm = (

            Number(
                C.terrain.coastInfluenceKm
            ) ||
            450
        );


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            const land = (
                this.land[i]
            );


            if (
                land <
                0.5
            ) {

                this.maritime[i] = (
                    1
                );


                this.continental[i] = (
                    0
                );


                continue;
            }


            const distance = (
                this.distanceToSeaKm[i]
            );


            const maritime = Math.exp(

                -distance /

                Math.max(
                    50,
                    coastInfluenceKm
                )
            );


            this.maritime[i] = U.clamp(

                maritime,

                0,

                1
            );


            this.continental[i] = U.clamp(

                1 -
                maritime,

                0,

                1
            );
        }
    }


    /* ========================================================================
       GRID POSITION
       ======================================================================== */

    gridPosition(
        lat,
        lon
    ) {

        const x = (

            (
                lon -
                C.bounds.west
            ) /

            (
                C.bounds.east -
                C.bounds.west
            ) *

            (
                this.nx -
                1
            )
        );


        const y = (

            (
                C.bounds.north -
                lat
            ) /

            (
                C.bounds.north -
                C.bounds.south
            ) *

            (
                this.ny -
                1
            )
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


    /* ========================================================================
       SAMPLE ARRAY
       ======================================================================== */

    sampleArray(
        array,
        lat,
        lon
    ) {

        const position = (
            this.gridPosition(
                lat,
                lon
            )
        );


        return U.bilinear(

            array,

            this.nx,

            this.ny,

            position.x,

            position.y
        );
    }


    /* ========================================================================
       COMPLETE TERRAIN SAMPLE
       ======================================================================== */

    sample(
        lat,
        lon
    ) {

        return {

            lat,

            lon,


            landFraction:
                this.sampleArray(
                    this.land,
                    lat,
                    lon
                ),


            altitudeM:
                this.sampleArray(
                    this.altitudeM,
                    lat,
                    lon
                ),


            distanceToSeaKm:
                this.sampleArray(
                    this.distanceToSeaKm,
                    lat,
                    lon
                ),


            distanceToLandKm:
                this.sampleArray(
                    this.distanceToLandKm,
                    lat,
                    lon
                ),


            maritime:
                this.sampleArray(
                    this.maritime,
                    lat,
                    lon
                ),


            continental:
                this.sampleArray(
                    this.continental,
                    lat,
                    lon
                )
        };
    }
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaTerrain = (
    EuropaTerrain
);


global.EuropaTerrainFunctions = Object.freeze({

    proceduralLandFraction,

    approximateAltitude
});

})(window);
