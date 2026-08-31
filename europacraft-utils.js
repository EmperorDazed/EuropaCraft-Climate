/* ============================================================================
   EuropaCraft Weather Simulator
   Shared Utility Library
   Version 7.2

   NEW FILE

   Provides common mathematical, geographical, atmospheric and interpolation
   functions used by the EuropaCraft climate/weather modules.
============================================================================ */

(function (global) {
"use strict";


const DEG = (
    Math.PI /
    180
);


const RAD = (
    180 /
    Math.PI
);


/* ============================================================================
   BASIC MATH
============================================================================ */

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


function inverseLerp(
    a,
    b,
    value
) {

    if (
        a ===
        b
    ) {

        return 0;
    }


    return (
        (
            value -
            a
        ) /
        (
            b -
            a
        )
    );
}


function smoothstep(
    edge0,
    edge1,
    value
) {

    const t = clamp(

        inverseLerp(
            edge0,
            edge1,
            value
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


function smootherstep(
    edge0,
    edge1,
    value
) {

    const t = clamp(

        inverseLerp(
            edge0,
            edge1,
            value
        ),

        0,

        1
    );


    return (
        t *
        t *
        t *
        (
            t *
            (
                t *
                6 -
                15
            ) +
            10
        )
    );
}


function mod(
    value,
    divisor
) {

    return (
        (
            value %
            divisor
        ) +
        divisor
    ) %
    divisor;
}


function toRadians(
    degrees
) {

    return (
        degrees *
        DEG
    );
}


function toDegrees(
    radians
) {

    return (
        radians *
        RAD
    );
}


/* ============================================================================
   GEOGRAPHY
============================================================================ */

function kmPerDegreeLatitude() {

    return (
        111.32
    );
}


function kmPerDegreeLongitude(
    latitude
) {

    return Math.max(

        1,

        111.32 *
        Math.cos(
            latitude *
            DEG
        )
    );
}


function haversineKm(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const earthRadiusKm = (
        6371.0088
    );


    const phi1 = (
        lat1 *
        DEG
    );


    const phi2 = (
        lat2 *
        DEG
    );


    const deltaPhi = (

        (
            lat2 -
            lat1
        ) *
        DEG
    );


    const deltaLambda = (

        (
            lon2 -
            lon1
        ) *
        DEG
    );


    const a = (

        Math.sin(
            deltaPhi /
            2
        ) ** 2 +

        Math.cos(
            phi1
        ) *

        Math.cos(
            phi2
        ) *

        Math.sin(
            deltaLambda /
            2
        ) ** 2
    );


    const c = (

        2 *

        Math.atan2(

            Math.sqrt(
                a
            ),

            Math.sqrt(
                1 -
                a
            )
        )
    );


    return (
        earthRadiusKm *
        c
    );
}


function bearingDeg(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const phi1 = (
        lat1 *
        DEG
    );


    const phi2 = (
        lat2 *
        DEG
    );


    const lambda = (

        (
            lon2 -
            lon1
        ) *
        DEG
    );


    const y = (

        Math.sin(
            lambda
        ) *

        Math.cos(
            phi2
        )
    );


    const x = (

        Math.cos(
            phi1
        ) *

        Math.sin(
            phi2
        ) -

        Math.sin(
            phi1
        ) *

        Math.cos(
            phi2
        ) *

        Math.cos(
            lambda
        )
    );


    return mod(

        Math.atan2(
            y,
            x
        ) *
        RAD,

        360
    );
}


function destinationPoint(
    lat,
    lon,
    bearing,
    distanceKm
) {

    const earthRadiusKm = (
        6371.0088
    );


    const angularDistance = (

        distanceKm /
        earthRadiusKm
    );


    const theta = (
        bearing *
        DEG
    );


    const phi1 = (
        lat *
        DEG
    );


    const lambda1 = (
        lon *
        DEG
    );


    const sinPhi2 = (

        Math.sin(
            phi1
        ) *

        Math.cos(
            angularDistance
        ) +

        Math.cos(
            phi1
        ) *

        Math.sin(
            angularDistance
        ) *

        Math.cos(
            theta
        )
    );


    const phi2 = Math.asin(
        clamp(
            sinPhi2,
            -1,
            1
        )
    );


    const y = (

        Math.sin(
            theta
        ) *

        Math.sin(
            angularDistance
        ) *

        Math.cos(
            phi1
        )
    );


    const x = (

        Math.cos(
            angularDistance
        ) -

        Math.sin(
            phi1
        ) *

        Math.sin(
            phi2
        )
    );


    const lambda2 = (

        lambda1 +

        Math.atan2(
            y,
            x
        )
    );


    return {

        lat:
            phi2 *
            RAD,

        lon:
            mod(
                lambda2 *
                RAD +
                180,
                360
            ) -
            180
    };
}


/* ============================================================================
   POINT TO LINE SEGMENT DISTANCE
============================================================================ */

function pointSegmentDistanceKm(
    lat,
    lon,
    lat1,
    lon1,
    lat2,
    lon2
) {

    const meanLat = (

        (
            lat +
            lat1 +
            lat2
        ) /
        3
    );


    const kx = (
        kmPerDegreeLongitude(
            meanLat
        )
    );


    const ky = (
        kmPerDegreeLatitude()
    );


    const px = (
        lon *
        kx
    );


    const py = (
        lat *
        ky
    );


    const ax = (
        lon1 *
        kx
    );


    const ay = (
        lat1 *
        ky
    );


    const bx = (
        lon2 *
        kx
    );


    const by = (
        lat2 *
        ky
    );


    const abx = (
        bx -
        ax
    );


    const aby = (
        by -
        ay
    );


    const lengthSquared = (

        abx *
        abx +

        aby *
        aby
    );


    let t = 0;


    if (
        lengthSquared >
        0
    ) {

        t = (

            (
                (
                    px -
                    ax
                ) *
                abx
            ) +

            (
                (
                    py -
                    ay
                ) *
                aby
            )

        ) /
        lengthSquared;
    }


    t = clamp(
        t,
        0,
        1
    );


    const cx = (

        ax +
        abx *
        t
    );


    const cy = (

        ay +
        aby *
        t
    );


    return Math.hypot(

        px -
        cx,

        py -
        cy
    );
}


/* ============================================================================
   DISTRIBUTION KERNELS
============================================================================ */

function gaussian(
    distance,
    sigma
) {

    sigma = Math.max(
        0.000001,
        sigma
    );


    return Math.exp(

        -0.5 *

        (
            distance /
            sigma
        ) ** 2
    );
}


function gaussian2D(
    x,
    y,
    sigmaX,
    sigmaY
) {

    sigmaX = Math.max(
        0.000001,
        sigmaX
    );


    sigmaY = Math.max(
        0.000001,
        sigmaY
    );


    return Math.exp(

        -0.5 *

        (
            (
                x /
                sigmaX
            ) ** 2 +

            (
                y /
                sigmaY
            ) ** 2
        )
    );
}


function compactKernel(
    distance,
    radius
) {

    if (
        radius <= 0 ||
        distance >=
        radius
    ) {

        return 0;
    }


    const t = (

        1 -
        distance /
        radius
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


/* ============================================================================
   ARRAY HELPERS
============================================================================ */

function createFloat32(
    length,
    value = 0
) {

    const array = (
        new Float32Array(
            length
        )
    );


    if (
        value !==
        0
    ) {

        array.fill(
            value
        );
    }


    return array;
}


function fillFloat32(
    array,
    value
) {

    array.fill(
        value
    );


    return array;
}


function copyFloat32(
    array
) {

    return (
        new Float32Array(
            array
        )
    );
}


/* ============================================================================
   BILINEAR INTERPOLATION

   Signature expected by parts of the new weather stack:

       bilinear(field, nx, ny, x, y)
============================================================================ */

function bilinear(
    field,
    nx,
    ny,
    x,
    y
) {

    if (
        !field ||
        nx <= 0 ||
        ny <= 0
    ) {

        return 0;
    }


    x = clamp(
        x,
        0,
        nx - 1
    );


    y = clamp(
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


    const top = lerp(

        field[i00],

        field[i10],

        tx
    );


    const bottom = lerp(

        field[i01],

        field[i11],

        tx
    );


    return lerp(

        top,

        bottom,

        ty
    );
}


/* ============================================================================
   DATE / TIME
============================================================================ */

function dayOfYearUTC(
    dateInput
) {

    const date = (

        dateInput instanceof Date

            ? dateInput

            : new Date(
                dateInput
            )
    );


    const start = Date.UTC(

        date.getUTCFullYear(),

        0,

        1
    );


    const current = Date.UTC(

        date.getUTCFullYear(),

        date.getUTCMonth(),

        date.getUTCDate()
    );


    return (

        Math.floor(

            (
                current -
                start
            ) /
            86400000
        ) +

        1
    );
}


function fractionalHourUTC(
    dateInput
) {

    const date = (

        dateInput instanceof Date

            ? dateInput

            : new Date(
                dateInput
            )
    );


    return (

        date.getUTCHours() +

        date.getUTCMinutes() /
        60 +

        date.getUTCSeconds() /
        3600 +

        date.getUTCMilliseconds() /
        3600000
    );
}


/* ============================================================================
   ATMOSPHERIC THERMODYNAMICS
============================================================================ */

function saturationVaporPressureHpa(
    temperatureC
) {

    /*
     * Magnus-type approximation.
     */

    if (
        temperatureC >=
        0
    ) {

        return (

            6.112 *

            Math.exp(

                17.67 *
                temperatureC /

                (
                    temperatureC +
                    243.5
                )
            )
        );
    }


    return (

        6.112 *

        Math.exp(

            22.46 *
            temperatureC /

            (
                temperatureC +
                272.62
            )
        )
    );
}


function qsatFromTempPressure(
    temperatureC,
    pressureHpa
) {

    pressureHpa = Math.max(
        100,
        pressureHpa
    );


    const vaporPressure = Math.min(

        saturationVaporPressureHpa(
            temperatureC
        ),

        pressureHpa *
        0.95
    );


    return (

        0.622 *
        vaporPressure /

        Math.max(

            1,

            pressureHpa -

            0.378 *
            vaporPressure
        )
    );
}


function relativeHumidity(
    temperatureC,
    pressureHpa,
    specificHumidity
) {

    const saturation = (
        qsatFromTempPressure(

            temperatureC,

            pressureHpa
        )
    );


    if (
        saturation <=
        0
    ) {

        return 0;
    }


    return clamp(

        specificHumidity /
        saturation,

        0,

        1.5
    );
}


function dewPointFromRH(
    temperatureC,
    rh
) {

    rh = clamp(
        rh,
        0.0001,
        1
    );


    const a = (
        17.625
    );


    const b = (
        243.04
    );


    const gamma = (

        Math.log(
            rh
        ) +

        a *
        temperatureC /

        (
            b +
            temperatureC
        )
    );


    return (

        b *
        gamma /

        (
            a -
            gamma
        )
    );
}


/* ============================================================================
   WIND VECTOR HELPERS

   Bearing convention:
       0°   = north
       90°  = east
       180° = south
       270° = west
============================================================================ */

function vectorFromBearingSpeed(
    bearing,
    speed
) {

    const angle = (
        bearing *
        DEG
    );


    return {

        u:
            Math.sin(
                angle
            ) *
            speed,

        v:
            Math.cos(
                angle
            ) *
            speed
    };
}


function bearingFromVector(
    u,
    v
) {

    if (
        Math.abs(
            u
        ) <
        0.000001 &&
        Math.abs(
            v
        ) <
        0.000001
    ) {

        return 0;
    }


    return mod(

        Math.atan2(
            u,
            v
        ) *
        RAD,

        360
    );
}


/* ============================================================================
   DETERMINISTIC RANDOMNESS
============================================================================ */

function seededRandom(
    seed = 1
) {

    let state = (

        Number(
            seed
        ) >>>
        0
    );


    if (
        state ===
        0
    ) {

        state = (
            0x6d2b79f5
        );
    }


    return function () {

        state += (
            0x6d2b79f5
        );


        let t = (
            state
        );


        t = Math.imul(

            t ^
            (
                t >>>
                15
            ),

            t |
            1
        );


        t ^= (

            t +

            Math.imul(

                t ^
                (
                    t >>>
                    7
                ),

                t |
                61
            )
        );


        return (

            (
                t ^
                (
                    t >>>
                    14
                )
            ) >>>
            0

        ) /
        4294967296;
    };
}


/* ============================================================================
   HASH / VALUE NOISE

   Used only where deterministic geographical roughness is desired.

   It should NOT be used to add arbitrary visual noise to weather fields.
============================================================================ */

function hash2D(
    x,
    y,
    seed = 0
) {

    let h = (

        Math.imul(
            x | 0,
            374761393
        ) +

        Math.imul(
            y | 0,
            668265263
        ) +

        Math.imul(
            seed | 0,
            1442695041
        )
    );


    h = (

        h ^
        (
            h >>>
            13
        )
    );


    h = Math.imul(

        h,

        1274126177
    );


    h = (

        h ^
        (
            h >>>
            16
        )
    );


    return (

        (
            h >>>
            0
        ) /
        4294967295
    );
}


function valueNoise2D(
    x,
    y,
    seed = 0
) {

    const x0 = Math.floor(
        x
    );


    const y0 = Math.floor(
        y
    );


    const x1 = (
        x0 +
        1
    );


    const y1 = (
        y0 +
        1
    );


    const tx = smoothstep(
        0,
        1,
        x -
        x0
    );


    const ty = smoothstep(
        0,
        1,
        y -
        y0
    );


    const a = (
        hash2D(
            x0,
            y0,
            seed
        )
    );


    const b = (
        hash2D(
            x1,
            y0,
            seed
        )
    );


    const c = (
        hash2D(
            x0,
            y1,
            seed
        )
    );


    const d = (
        hash2D(
            x1,
            y1,
            seed
        )
    );


    return lerp(

        lerp(
            a,
            b,
            tx
        ),

        lerp(
            c,
            d,
            tx
        ),

        ty
    );
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaUtils = Object.freeze({

    DEG,

    RAD,


    clamp,

    lerp,

    inverseLerp,

    smoothstep,

    smootherstep,

    mod,


    toRadians,

    toDegrees,


    kmPerDegreeLatitude,

    kmPerDegreeLongitude,

    haversineKm,

    bearingDeg,

    destinationPoint,

    pointSegmentDistanceKm,


    gaussian,

    gaussian2D,

    compactKernel,


    createFloat32,

    fillFloat32,

    copyFloat32,

    bilinear,


    dayOfYearUTC,

    fractionalHourUTC,


    saturationVaporPressureHpa,

    qsatFromTempPressure,

    relativeHumidity,

    dewPointFromRH,


    vectorFromBearingSpeed,

    bearingFromVector,


    seededRandom,

    hash2D,

    valueNoise2D
});

})(window);
