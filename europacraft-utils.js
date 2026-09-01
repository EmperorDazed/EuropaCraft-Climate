/*
 * EuropaCraft Atmospheric Simulation
 * V10 Utility Library
 *
 * Shared numerical, geographical and thermodynamic functions.
 *
 * V10 ONLY.
 */

(function (global) {
    "use strict";


    /* ================================================================
       CONSTANTS
    ================================================================ */

    const DEG_TO_RAD =
        Math.PI / 180;

    const RAD_TO_DEG =
        180 / Math.PI;

    const EARTH_RADIUS_KM =
        6371.0088;

    const EARTH_RADIUS_M =
        EARTH_RADIUS_KM * 1000;

    const GRAVITY =
        9.80665;

    const RD =
        287.05;

    const RV =
        461.5;

    const CP =
        1004.0;

    const EPSILON =
        RD / RV;

    const LATENT_HEAT_VAPORIZATION =
        2.5e6;

    const LATENT_HEAT_FUSION =
        3.34e5;

    const KELVIN_OFFSET =
        273.15;


    /* ================================================================
       BASIC NUMERICAL UTILITIES
    ================================================================ */

    function clamp(
        value,
        minimum,
        maximum
    ) {

        if (!Number.isFinite(value)) {
            return minimum;
        }

        return Math.max(
            minimum,
            Math.min(
                maximum,
                value
            )
        );
    }


    function clamp01(
        value
    ) {

        return clamp(
            value,
            0,
            1
        );
    }


    function lerp(
        a,
        b,
        t
    ) {

        return (
            a +
            (b - a) * t
        );
    }


    function invLerp(
        a,
        b,
        value
    ) {

        if (a === b) {
            return 0;
        }

        return (
            (value - a) /
            (b - a)
        );
    }


    function remap(
        value,
        sourceMin,
        sourceMax,
        destinationMin,
        destinationMax
    ) {

        return lerp(
            destinationMin,
            destinationMax,
            invLerp(
                sourceMin,
                sourceMax,
                value
            )
        );
    }


    function smoothstep(
        edge0,
        edge1,
        value
    ) {

        if (edge0 === edge1) {
            return (
                value < edge0
                    ? 0
                    : 1
            );
        }

        const t =
            clamp01(
                (value - edge0) /
                (edge1 - edge0)
            );

        return (
            t *
            t *
            (3 - 2 * t)
        );
    }


    function smootherstep(
        edge0,
        edge1,
        value
    ) {

        const t =
            clamp01(
                (value - edge0) /
                (edge1 - edge0)
            );

        return (
            t *
            t *
            t *
            (
                t *
                (
                    t * 6 - 15
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
                value % divisor
            ) +
            divisor
        ) % divisor;
    }


    function wrapDegrees(
        degrees
    ) {

        return mod(
            degrees,
            360
        );
    }


    function shortestAngleDifference(
        a,
        b
    ) {

        return (
            mod(
                b - a + 180,
                360
            ) -
            180
        );
    }


    function signedPow(
        value,
        exponent
    ) {

        return (
            Math.sign(value) *
            Math.pow(
                Math.abs(value),
                exponent
            )
        );
    }


    function safeDivide(
        numerator,
        denominator,
        fallback = 0
    ) {

        if (
            !Number.isFinite(numerator) ||
            !Number.isFinite(denominator) ||
            Math.abs(denominator) < 1e-12
        ) {
            return fallback;
        }

        return (
            numerator /
            denominator
        );
    }


    function finiteOr(
        value,
        fallback = 0
    ) {

        return (
            Number.isFinite(value)
                ? value
                : fallback
        );
    }


    function mean(
        values
    ) {

        if (
            !values ||
            values.length === 0
        ) {
            return 0;
        }

        let total = 0;

        for (
            let i = 0;
            i < values.length;
            i++
        ) {
            total += values[i];
        }

        return (
            total /
            values.length
        );
    }


    function hypot2(
        x,
        y
    ) {

        return Math.sqrt(
            x * x +
            y * y
        );
    }


    function hypot3(
        x,
        y,
        z
    ) {

        return Math.sqrt(
            x * x +
            y * y +
            z * z
        );
    }


    /* ================================================================
       ARRAY UTILITIES
    ================================================================ */

    function createFloatArray(
        length,
        initialValue = 0
    ) {

        const array =
            new Float32Array(
                length
            );

        if (
            initialValue !== 0
        ) {
            array.fill(
                initialValue
            );
        }

        return array;
    }


    function copyFloat32(
        source
    ) {

        const output =
            new Float32Array(
                source.length
            );

        output.set(
            source
        );

        return output;
    }


    function copyUint8(
        source
    ) {

        const output =
            new Uint8Array(
                source.length
            );

        output.set(
            source
        );

        return output;
    }


    function fillFinite(
        array,
        fallback = 0
    ) {

        for (
            let i = 0;
            i < array.length;
            i++
        ) {

            if (
                !Number.isFinite(
                    array[i]
                )
            ) {
                array[i] =
                    fallback;
            }
        }

        return array;
    }


    /* ================================================================
       GRID INTERPOLATION
    ================================================================ */

    function bilinear(
        array,
        nx,
        ny,
        x,
        y
    ) {

        x =
            clamp(
                x,
                0,
                nx - 1.000001
            );

        y =
            clamp(
                y,
                0,
                ny - 1.000001
            );

        const x0 =
            Math.floor(x);

        const y0 =
            Math.floor(y);

        const x1 =
            Math.min(
                nx - 1,
                x0 + 1
            );

        const y1 =
            Math.min(
                ny - 1,
                y0 + 1
            );

        const tx =
            x - x0;

        const ty =
            y - y0;

        const i00 =
            y0 * nx + x0;

        const i10 =
            y0 * nx + x1;

        const i01 =
            y1 * nx + x0;

        const i11 =
            y1 * nx + x1;

        const north =
            lerp(
                array[i00],
                array[i10],
                tx
            );

        const south =
            lerp(
                array[i01],
                array[i11],
                tx
            );

        return lerp(
            north,
            south,
            ty
        );
    }


    function bilinearClamped(
        array,
        nx,
        ny,
        x,
        y,
        minimum,
        maximum
    ) {

        return clamp(
            bilinear(
                array,
                nx,
                ny,
                x,
                y
            ),
            minimum,
            maximum
        );
    }


    /* ================================================================
       GEOGRAPHY
    ================================================================ */

    function haversineKm(
        lat1,
        lon1,
        lat2,
        lon2
    ) {

        const p1 =
            lat1 * DEG_TO_RAD;

        const p2 =
            lat2 * DEG_TO_RAD;

        const dp =
            (
                lat2 -
                lat1
            ) *
            DEG_TO_RAD;

        const dl =
            (
                lon2 -
                lon1
            ) *
            DEG_TO_RAD;

        const a =
            Math.sin(
                dp / 2
            ) ** 2 +
            Math.cos(p1) *
            Math.cos(p2) *
            Math.sin(
                dl / 2
            ) ** 2;

        return (
            2 *
            EARTH_RADIUS_KM *
            Math.asin(
                Math.min(
                    1,
                    Math.sqrt(a)
                )
            )
        );
    }


    function kmPerDegreeLongitude(
        latitude
    ) {

        return (
            111.320 *
            Math.max(
                0.08,
                Math.cos(
                    latitude *
                    DEG_TO_RAD
                )
            )
        );
    }


    function kmPerDegreeLatitude(
        latitude
    ) {

        const phi =
            latitude *
            DEG_TO_RAD;

        return (
            111.132 -
            0.559 *
            Math.cos(
                2 * phi
            ) +
            0.001175 *
            Math.cos(
                4 * phi
            )
        );
    }


    function offsetLatLon(
        latitude,
        longitude,
        eastKm,
        northKm
    ) {

        return {

            lat:
                latitude +
                northKm /
                kmPerDegreeLatitude(
                    latitude
                ),

            lon:
                longitude +
                eastKm /
                kmPerDegreeLongitude(
                    latitude
                )
        };
    }


    function bearingDeg(
        lat1,
        lon1,
        lat2,
        lon2
    ) {

        const p1 =
            lat1 *
            DEG_TO_RAD;

        const p2 =
            lat2 *
            DEG_TO_RAD;

        const dl =
            (
                lon2 -
                lon1
            ) *
            DEG_TO_RAD;

        const y =
            Math.sin(dl) *
            Math.cos(p2);

        const x =
            Math.cos(p1) *
            Math.sin(p2) -
            Math.sin(p1) *
            Math.cos(p2) *
            Math.cos(dl);

        return wrapDegrees(
            Math.atan2(
                y,
                x
            ) *
            RAD_TO_DEG
        );
    }


    function vectorFromBearingSpeed(
        bearingDegrees,
        speedMs
    ) {

        const angle =
            bearingDegrees *
            DEG_TO_RAD;

        return {

            u:
                Math.sin(angle) *
                speedMs,

            v:
                Math.cos(angle) *
                speedMs
        };
    }


    function bearingFromVector(
        u,
        v
    ) {

        if (
            Math.abs(u) < 1e-9 &&
            Math.abs(v) < 1e-9
        ) {
            return 0;
        }

        return wrapDegrees(
            Math.atan2(
                u,
                v
            ) *
            RAD_TO_DEG
        );
    }


    function meteorologicalWindFromDirection(
        u,
        v
    ) {

        /*
         * Returns the direction FROM which the wind blows.
         */

        return wrapDegrees(
            bearingFromVector(
                -u,
                -v
            )
        );
    }


    function pointSegmentDistanceKm(
        lat,
        lon,
        startLat,
        startLon,
        endLat,
        endLon
    ) {

        const referenceLatitude =
            (
                lat +
                startLat +
                endLat
            ) / 3;

        const scaleX =
            kmPerDegreeLongitude(
                referenceLatitude
            );

        const scaleY =
            kmPerDegreeLatitude(
                referenceLatitude
            );

        const px =
            (
                lon -
                startLon
            ) *
            scaleX;

        const py =
            (
                lat -
                startLat
            ) *
            scaleY;

        const bx =
            (
                endLon -
                startLon
            ) *
            scaleX;

        const by =
            (
                endLat -
                startLat
            ) *
            scaleY;

        const segmentLengthSquared =
            bx * bx +
            by * by;

        const t =
            segmentLengthSquared > 0
                ? clamp01(
                    (
                        px * bx +
                        py * by
                    ) /
                    segmentLengthSquared
                )
                : 0;

        const dx =
            px -
            bx * t;

        const dy =
            py -
            by * t;

        return Math.sqrt(
            dx * dx +
            dy * dy
        );
    }


    /* ================================================================
       TIME AND SOLAR GEOMETRY
    ================================================================ */

    function dayOfYearUTC(
        date
    ) {

        const d =
            date instanceof Date
                ? date
                : new Date(date);

        const start =
            Date.UTC(
                d.getUTCFullYear(),
                0,
                0
            );

        const current =
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


    function decimalHourUTC(
        date
    ) {

        return (
            date.getUTCHours() +
            date.getUTCMinutes() / 60 +
            date.getUTCSeconds() / 3600
        );
    }


    function solarDeclinationRad(
        date
    ) {

        const day =
            dayOfYearUTC(
                date
            );

        return (
            23.44 *
            DEG_TO_RAD *
            Math.sin(
                2 *
                Math.PI *
                (
                    284 +
                    day
                ) /
                365.2422
            )
        );
    }


    function solarSinElevation(
        latitude,
        longitude,
        date
    ) {

        const latitudeRad =
            latitude *
            DEG_TO_RAD;

        const declination =
            solarDeclinationRad(
                date
            );

        /*
         * Approximate local solar time from longitude.
         * Sufficient for the simulator's radiative tendency.
         */

        const localSolarHour =
            decimalHourUTC(
                date
            ) +
            longitude / 15;

        const hourAngle =
            (
                localSolarHour -
                12
            ) *
            15 *
            DEG_TO_RAD;

        return clamp(
            Math.sin(latitudeRad) *
            Math.sin(declination) +
            Math.cos(latitudeRad) *
            Math.cos(declination) *
            Math.cos(hourAngle),
            -1,
            1
        );
    }


    function solarElevationDeg(
        latitude,
        longitude,
        date
    ) {

        return (
            Math.asin(
                solarSinElevation(
                    latitude,
                    longitude,
                    date
                )
            ) *
            RAD_TO_DEG
        );
    }


    /* ================================================================
       SHAPE / WEIGHT FUNCTIONS
    ================================================================ */

    function gaussian(
        distance,
        sigma
    ) {

        const safeSigma =
            Math.max(
                1e-9,
                sigma
            );

        const z =
            distance /
            safeSigma;

        return Math.exp(
            -0.5 *
            z *
            z
        );
    }


    function radialWeight(
        distanceKm,
        radiusKm,
        exponent = 2
    ) {

        if (
            radiusKm <= 0 ||
            distanceKm >= radiusKm
        ) {
            return 0;
        }

        const x =
            1 -
            distanceKm /
            radiusKm;

        return Math.pow(
            smoothstep(
                0,
                1,
                x
            ),
            exponent
        );
    }


    /* ================================================================
       RANDOM NUMBER GENERATION
    ================================================================ */

    function seededRandom(
        seed
    ) {

        let state =
            (
                seed >>> 0
            ) || 1;

        return function () {

            state ^=
                state << 13;

            state ^=
                state >>> 17;

            state ^=
                state << 5;

            return (
                (
                    state >>> 0
                ) /
                4294967296
            );
        };
    }


    function randomNormal(
        random = Math.random
    ) {

        let u1 =
            random();

        let u2 =
            random();

        u1 =
            Math.max(
                u1,
                1e-12
            );

        return (
            Math.sqrt(
                -2 *
                Math.log(u1)
            ) *
            Math.cos(
                2 *
                Math.PI *
                u2
            )
        );
    }


    /* ================================================================
       THERMODYNAMICS
    ================================================================ */

    function celsiusToKelvin(
        temperatureC
    ) {

        return (
            temperatureC +
            KELVIN_OFFSET
        );
    }


    function kelvinToCelsius(
        temperatureK
    ) {

        return (
            temperatureK -
            KELVIN_OFFSET
        );
    }


    function saturationVaporPressureWaterHpa(
        temperatureC
    ) {

        /*
         * Bolton-style formulation.
         */

        return (
            6.112 *
            Math.exp(
                (
                    17.67 *
                    temperatureC
                ) /
                (
                    temperatureC +
                    243.5
                )
            )
        );
    }


    function saturationVaporPressureIceHpa(
        temperatureC
    ) {

        return (
            6.112 *
            Math.exp(
                (
                    22.46 *
                    temperatureC
                ) /
                (
                    temperatureC +
                    272.62
                )
            )
        );
    }


    function saturationVaporPressureHpa(
        temperatureC
    ) {

        if (
            temperatureC >= 0
        ) {
            return saturationVaporPressureWaterHpa(
                temperatureC
            );
        }

        /*
         * Smoothly transition between water and ice saturation close
         * to freezing to avoid abrupt model discontinuities.
         */

        if (
            temperatureC <= -20
        ) {
            return saturationVaporPressureIceHpa(
                temperatureC
            );
        }

        const blend =
            clamp01(
                (
                    temperatureC +
                    20
                ) /
                20
            );

        return lerp(
            saturationVaporPressureIceHpa(
                temperatureC
            ),
            saturationVaporPressureWaterHpa(
                temperatureC
            ),
            blend
        );
    }


    function specificHumidityFromVaporPressure(
        vaporPressureHpa,
        pressureHpa
    ) {

        const e =
            Math.max(
                0,
                vaporPressureHpa
            );

        const p =
            Math.max(
                e + 0.01,
                pressureHpa
            );

        return clamp(
            (
                EPSILON *
                e
            ) /
            (
                p -
                (
                    1 -
                    EPSILON
                ) *
                e
            ),
            0,
            0.1
        );
    }


    function vaporPressureFromSpecificHumidity(
        specificHumidity,
        pressureHpa
    ) {

        const q =
            clamp(
                specificHumidity,
                0,
                0.1
            );

        return (
            q *
            pressureHpa /
            (
                EPSILON +
                (
                    1 -
                    EPSILON
                ) *
                q
            )
        );
    }


    function qsatFromTempPressure(
        temperatureC,
        pressureHpa
    ) {

        return specificHumidityFromVaporPressure(
            saturationVaporPressureHpa(
                temperatureC
            ),
            pressureHpa
        );
    }


    function relativeHumidity(
        temperatureC,
        pressureHpa,
        specificHumidity
    ) {

        const saturation =
            qsatFromTempPressure(
                temperatureC,
                pressureHpa
            );

        if (
            saturation <= 1e-10
        ) {
            return 0;
        }

        return clamp(
            specificHumidity /
            saturation,
            0,
            2
        );
    }


    function relativeHumidityPct(
        temperatureC,
        pressureHpa,
        specificHumidity
    ) {

        return (
            relativeHumidity(
                temperatureC,
                pressureHpa,
                specificHumidity
            ) *
            100
        );
    }


    function dewPointFromVaporPressure(
        vaporPressureHpa
    ) {

        const e =
            Math.max(
                0.001,
                vaporPressureHpa
            );

        const ln =
            Math.log(
                e /
                6.112
            );

        return (
            243.5 *
            ln /
            (
                17.67 -
                ln
            )
        );
    }


    function dewPointC(
        pressureHpa,
        specificHumidity
    ) {

        return dewPointFromVaporPressure(
            vaporPressureFromSpecificHumidity(
                specificHumidity,
                pressureHpa
            )
        );
    }


    function wetBulbC(
        temperatureC,
        pressureHpa,
        specificHumidity
    ) {

        /*
         * Stull approximation gives an excellent fast first estimate.
         *
         * We then constrain it physically between dew point and dry-bulb
         * temperature. This calculation is called for tens of thousands
         * of grid cells, so iterative psychrometric solving is avoided.
         */

        const rh =
            clamp(
                relativeHumidityPct(
                    temperatureC,
                    pressureHpa,
                    specificHumidity
                ),
                1,
                100
            );

        const t =
            temperatureC;

        let tw =
            t *
            Math.atan(
                0.151977 *
                Math.sqrt(
                    rh +
                    8.313659
                )
            ) +
            Math.atan(
                t +
                rh
            ) -
            Math.atan(
                rh -
                1.676331
            ) +
            0.00391838 *
            Math.pow(
                rh,
                1.5
            ) *
            Math.atan(
                0.023101 *
                rh
            ) -
            4.686035;

        const dew =
            dewPointC(
                pressureHpa,
                specificHumidity
            );

        tw =
            clamp(
                tw,
                Math.min(
                    dew,
                    t
                ),
                Math.max(
                    dew,
                    t
                )
            );

        return tw;
    }


    function saturationDeficitKgKg(
        temperatureC,
        pressureHpa,
        specificHumidity
    ) {

        return Math.max(
            0,
            qsatFromTempPressure(
                temperatureC,
                pressureHpa
            ) -
            specificHumidity
        );
    }


    function supersaturationKgKg(
        temperatureC,
        pressureHpa,
        specificHumidity
    ) {

        return Math.max(
            0,
            specificHumidity -
            qsatFromTempPressure(
                temperatureC,
                pressureHpa
            )
        );
    }


    function potentialTemperatureK(
        temperatureC,
        pressureHpa
    ) {

        const temperatureK =
            celsiusToKelvin(
                temperatureC
            );

        return (
            temperatureK *
            Math.pow(
                1000 /
                Math.max(
                    100,
                    pressureHpa
                ),
                RD / CP
            )
        );
    }


    function virtualTemperatureK(
        temperatureC,
        specificHumidity
    ) {

        const temperatureK =
            celsiusToKelvin(
                temperatureC
            );

        return (
            temperatureK *
            (
                1 +
                0.61 *
                Math.max(
                    0,
                    specificHumidity
                )
            )
        );
    }


    function densityKgM3(
        temperatureC,
        pressureHpa,
        specificHumidity = 0
    ) {

        const virtualTemperature =
            virtualTemperatureK(
                temperatureC,
                specificHumidity
            );

        return (
            pressureHpa *
            100 /
            (
                RD *
                Math.max(
                    150,
                    virtualTemperature
                )
            )
        );
    }


    function approximatePressureAtHeightHpa(
        surfacePressureHpa,
        temperatureC,
        heightM
    ) {

        const temperatureK =
            Math.max(
                180,
                celsiusToKelvin(
                    temperatureC
                )
            );

        return (
            surfacePressureHpa *
            Math.exp(
                -GRAVITY *
                heightM /
                (
                    RD *
                    temperatureK
                )
            )
        );
    }


    function lapseAdjustedTemperature(
        sourceTemperatureC,
        heightDifferenceM,
        lapseRateCPerKm = 6.2
    ) {

        return (
            sourceTemperatureC -
            lapseRateCPerKm *
            heightDifferenceM /
            1000
        );
    }


    function moistStaticEnergyApprox(
        temperatureC,
        heightM,
        specificHumidity
    ) {

        return (
            CP *
            celsiusToKelvin(
                temperatureC
            ) +
            GRAVITY *
            heightM +
            LATENT_HEAT_VAPORIZATION *
            specificHumidity
        );
    }


    /* ================================================================
       PRESSURE-LEVEL INTERPOLATION
    ================================================================ */

    function logPressureInterpolation(
        valueLower,
        pressureLower,
        valueUpper,
        pressureUpper,
        targetPressure
    ) {

        if (
            pressureLower ===
            pressureUpper
        ) {
            return valueLower;
        }

        const lp0 =
            Math.log(
                pressureLower
            );

        const lp1 =
            Math.log(
                pressureUpper
            );

        const lpt =
            Math.log(
                targetPressure
            );

        const t =
            clamp01(
                (
                    lpt -
                    lp0
                ) /
                (
                    lp1 -
                    lp0
                )
            );

        return lerp(
            valueLower,
            valueUpper,
            t
        );
    }


    /* ================================================================
       TRACER UTILITIES
    ================================================================ */

    function normalizeWeights(
        values,
        fallbackIndex = 0
    ) {

        let total = 0;

        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            const value =
                Math.max(
                    0,
                    finiteOr(
                        values[i],
                        0
                    )
                );

            values[i] =
                value;

            total += value;
        }

        if (
            total <= 1e-12
        ) {

            values.fill(
                0
            );

            if (
                fallbackIndex >= 0 &&
                fallbackIndex < values.length
            ) {
                values[
                    fallbackIndex
                ] = 1;
            }

            return values;
        }

        const inverse =
            1 /
            total;

        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            values[i] *=
                inverse;
        }

        return values;
    }


    function dominantWeightIndex(
        values
    ) {

        let index = -1;

        let maximum =
            -Infinity;

        for (
            let i = 0;
            i < values.length;
            i++
        ) {

            if (
                values[i] >
                maximum
            ) {

                maximum =
                    values[i];

                index =
                    i;
            }
        }

        return index;
    }


    function tracerContrast(
        a,
        b
    ) {

        const length =
            Math.min(
                a.length,
                b.length
            );

        let difference =
            0;

        for (
            let i = 0;
            i < length;
            i++
        ) {

            difference +=
                Math.abs(
                    a[i] -
                    b[i]
                );
        }

        /*
         * Total variation distance.
         * 0 = identical mixture
         * 1 = completely different pure air masses
         */

        return clamp01(
            difference *
            0.5
        );
    }


    function mixTracerVectors(
        destination,
        sourceA,
        sourceB,
        fractionB
    ) {

        const t =
            clamp01(
                fractionB
            );

        const length =
            Math.min(
                destination.length,
                sourceA.length,
                sourceB.length
            );

        for (
            let i = 0;
            i < length;
            i++
        ) {

            destination[i] =
                lerp(
                    sourceA[i],
                    sourceB[i],
                    t
                );
        }

        normalizeWeights(
            destination
        );

        return destination;
    }


    /* ================================================================
       DIFFERENTIAL HELPERS
    ================================================================ */

    function gradient2D(
        array,
        nx,
        ny,
        x,
        y,
        dx,
        dy
    ) {

        const xLeft =
            Math.max(
                0,
                x - 1
            );

        const xRight =
            Math.min(
                nx - 1,
                x + 1
            );

        const yUp =
            Math.max(
                0,
                y - 1
            );

        const yDown =
            Math.min(
                ny - 1,
                y + 1
            );

        const spanX =
            Math.max(
                1,
                xRight -
                xLeft
            );

        const spanY =
            Math.max(
                1,
                yDown -
                yUp
            );

        return {

            dx:
                (
                    array[
                        y * nx +
                        xRight
                    ] -
                    array[
                        y * nx +
                        xLeft
                    ]
                ) /
                (
                    Math.max(
                        1e-9,
                        dx
                    ) *
                    spanX
                ),

            dy:
                (
                    array[
                        yUp * nx +
                        x
                    ] -
                    array[
                        yDown * nx +
                        x
                    ]
                ) /
                (
                    Math.max(
                        1e-9,
                        dy
                    ) *
                    spanY
                )
        };
    }


    function divergence2D(
        u,
        v,
        nx,
        ny,
        x,
        y,
        dx,
        dy
    ) {

        const gu =
            gradient2D(
                u,
                nx,
                ny,
                x,
                y,
                dx,
                dy
            );

        const gv =
            gradient2D(
                v,
                nx,
                ny,
                x,
                y,
                dx,
                dy
            );

        return (
            gu.dx +
            gv.dy
        );
    }


    function convergence2D(
        u,
        v,
        nx,
        ny,
        x,
        y,
        dx,
        dy
    ) {

        return (
            -divergence2D(
                u,
                v,
                nx,
                ny,
                x,
                y,
                dx,
                dy
            )
        );
    }


    function vorticity2D(
        u,
        v,
        nx,
        ny,
        x,
        y,
        dx,
        dy
    ) {

        const gu =
            gradient2D(
                u,
                nx,
                ny,
                x,
                y,
                dx,
                dy
            );

        const gv =
            gradient2D(
                v,
                nx,
                ny,
                x,
                y,
                dx,
                dy
            );

        return (
            gv.dx -
            gu.dy
        );
    }


    /* ================================================================
       NUMERICAL VALIDATION
    ================================================================ */

    function assertFiniteArray(
        array,
        name
    ) {

        for (
            let i = 0;
            i < array.length;
            i++
        ) {

            if (
                !Number.isFinite(
                    array[i]
                )
            ) {

                throw new Error(
                    "EuropaCraft V10 numerical failure: " +
                    name +
                    "[" +
                    i +
                    "] = " +
                    array[i]
                );
            }
        }

        return true;
    }


    function clampArray(
        array,
        minimum,
        maximum
    ) {

        for (
            let i = 0;
            i < array.length;
            i++
        ) {

            array[i] =
                clamp(
                    array[i],
                    minimum,
                    maximum
                );
        }

        return array;
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaUtils =
        Object.freeze({

            constants:
                Object.freeze({

                    DEG_TO_RAD,
                    RAD_TO_DEG,

                    EARTH_RADIUS_KM,
                    EARTH_RADIUS_M,

                    GRAVITY,

                    RD,
                    RV,
                    CP,

                    EPSILON,

                    LATENT_HEAT_VAPORIZATION,
                    LATENT_HEAT_FUSION,

                    KELVIN_OFFSET
                }),

            DEG:
                DEG_TO_RAD,

            EARTH_KM:
                EARTH_RADIUS_KM,

            clamp,
            clamp01,

            lerp,
            invLerp,
            remap,

            smoothstep,
            smootherstep,

            mod,
            wrapDegrees,
            shortestAngleDifference,

            signedPow,

            safeDivide,
            finiteOr,

            mean,

            hypot2,
            hypot3,

            createFloatArray,
            copyFloat32,
            copyUint8,
            fillFinite,

            bilinear,
            bilinearClamped,

            haversineKm,
            kmPerDegreeLongitude,
            kmPerDegreeLatitude,
            offsetLatLon,

            bearingDeg,
            vectorFromBearingSpeed,
            bearingFromVector,
            meteorologicalWindFromDirection,

            pointSegmentDistanceKm,

            dayOfYearUTC,
            decimalHourUTC,

            solarDeclinationRad,
            solarSinElevation,
            solarElevationDeg,

            gaussian,
            radialWeight,

            seededRandom,
            randomNormal,

            celsiusToKelvin,
            kelvinToCelsius,

            saturationVaporPressureWaterHpa,
            saturationVaporPressureIceHpa,
            saturationVaporPressureHpa,

            specificHumidityFromVaporPressure,
            vaporPressureFromSpecificHumidity,

            qsatFromTempPressure,

            relativeHumidity,
            relativeHumidityPct,

            dewPointFromVaporPressure,
            dewPointC,

            wetBulbC,

            saturationDeficitKgKg,
            supersaturationKgKg,

            potentialTemperatureK,
            virtualTemperatureK,
            densityKgM3,

            approximatePressureAtHeightHpa,

            lapseAdjustedTemperature,

            moistStaticEnergyApprox,

            logPressureInterpolation,

            normalizeWeights,
            dominantWeightIndex,
            tracerContrast,
            mixTracerVectors,

            gradient2D,
            divergence2D,
            convergence2D,
            vorticity2D,

            assertFiniteArray,
            clampArray
        });

})(window);
