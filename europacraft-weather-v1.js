(function () {
    "use strict";

    var DEG = Math.PI / 180;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getDate(date) {
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
        return getDate(date).getTime() / 86400000;
    }

    function dayOfYear(date) {
        var d = getDate(date);

        var start = Date.UTC(
            d.getUTCFullYear(),
            0,
            0
        );

        var now = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate()
        );

        return Math.floor(
            (now - start) / 86400000
        );
    }


    /* ======================================================
       PRESSURE
    ====================================================== */

    function pressure(latitude, longitude, date) {
        var t = dayNumber(date);

        var wave1 =
            7.0 *
            Math.sin(
                (
                    longitude * 1.35 +
                    latitude * 0.30 +
                    t * 11.0
                ) *
                DEG
            );

        var wave2 =
            4.5 *
            Math.cos(
                (
                    longitude * 2.1 -
                    latitude * 0.75 -
                    t * 7.0
                ) *
                DEG
            );

        var wave3 =
            2.5 *
            Math.sin(
                (
                    longitude * 4.0 +
                    latitude * 1.6 +
                    t * 17.0
                ) *
                DEG
            );

        var atlanticLat =
            (latitude - 57) / 11;

        var atlanticLon =
            (longitude + 13) / 23;

        var atlanticLow =
            -5.0 *
            Math.exp(
                -(
                    atlanticLat * atlanticLat +
                    atlanticLon * atlanticLon
                )
            );

        var azoresLat =
            (latitude - 35) / 9;

        var azoresLon =
            (longitude + 10) / 24;

        var azoresHigh =
            5.0 *
            Math.exp(
                -(
                    azoresLat * azoresLat +
                    azoresLon * azoresLon
                )
            );

        return (
            1014.0 +
            wave1 +
            wave2 +
            wave3 +
            atlanticLow +
            azoresHigh
        );
    }


    /* ======================================================
       PRESSURE GRADIENT
    ====================================================== */

    function pressureGradient(latitude, longitude, date) {
        var step = 0.25;

        var north =
            pressure(
                latitude + step,
                longitude,
                date
            );

        var south =
            pressure(
                latitude - step,
                longitude,
                date
            );

        var east =
            pressure(
                latitude,
                longitude + step,
                date
            );

        var west =
            pressure(
                latitude,
                longitude - step,
                date
            );

        var ns =
            (north - south) /
            (step * 2);

        var ew =
            (east - west) /
            (step * 2);

        return {
            northSouth: ns,
            eastWest: ew,
            magnitude: Math.sqrt(
                ns * ns +
                ew * ew
            )
        };
    }


    /* ======================================================
       WIND
    ====================================================== */

    function windAt(latitude, longitude, date) {
        var gradient =
            pressureGradient(
                latitude,
                longitude,
                date
            );

        var latitudeFactor =
            clamp(
                (latitude - 25) / 35,
                0.35,
                1
            );

        var u =
            -gradient.northSouth *
            2.2 *
            latitudeFactor;

        var v =
            gradient.eastWest *
            2.2 *
            latitudeFactor;

        var speed =
            Math.sqrt(
                u * u +
                v * v
            );

        if (speed > 32) {
            var scale =
                32 / speed;

            u *= scale;
            v *= scale;
            speed = 32;
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


    /* ======================================================
       SEASON
    ====================================================== */

    function seasonalCosine(date) {
        var doy =
            dayOfYear(date);

        return Math.cos(
            2 *
            Math.PI *
            (doy - 205) /
            365.2422
        );
    }


    /* ======================================================
       CLIMATE INDICES SAFETY
    ====================================================== */

    function safeIndex(climate, name) {
        if (
            !climate ||
            !climate.indices ||
            typeof climate.indices[name] !== "number"
        ) {
            return 0;
        }

        return climate.indices[name];
    }


    /* ======================================================
       BASE TEMPERATURE
    ====================================================== */

    function baselineTemperature(
        latitude,
        longitude,
        date,
        climate,
        landFraction
    ) {
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

        var warmSource =
            safeIndex(
                climate,
                "warmSource"
            );

        var coldSource =
            safeIndex(
                climate,
                "coldSource"
            );

        var seasonal =
            seasonalCosine(date);

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

        var annualMean =
            16.2 -
            Math.max(
                0,
                latitude - 35
            ) *
            0.30;

        annualMean -=
            Math.max(
                0,
                longitude - 15
            ) *
            0.025;

        annualMean +=
            warmSource *
            2.2;

        annualMean -=
            coldSource *
            1.8;

        var amplitude =
            5.2 +
            Math.max(
                0,
                latitude - 35
            ) *
            0.14;

        amplitude +=
            continental *
            8.5;

        amplitude -=
            maritime *
            5.0;

        amplitude =
            clamp(
                amplitude,
                4.5,
                18
            );

        var temperature =
            annualMean +
            seasonal *
            amplitude;

        temperature +=
            warmSource *
            summer *
            2.0;

        temperature -=
            continental *
            winter *
            4.2;

        temperature +=
            maritime *
            winter *
            4.0;

        var waterFraction =
            1 -
            landFraction;

        temperature +=
            waterFraction *
            winter *
            2.0;

        temperature -=
            waterFraction *
            summer *
            1.5;

        return temperature;
    }


    /* ======================================================
       LOCAL SOLAR HOUR
    ====================================================== */

    function localSolarHour(
        longitude,
        date
    ) {
        var d =
            getDate(date);

        var hour =
            d.getUTCHours() +
            d.getUTCMinutes() / 60 +
            longitude / 15;

        hour =
            (
                hour %
                24 +
                24
            ) %
            24;

        return hour;
    }


    /* ======================================================
       DIURNAL TEMPERATURE
    ====================================================== */

    function diurnalOffset(
        longitude,
        date,
        climate,
        landFraction,
        cloud
    ) {
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

        var range =
            3.0 +
            landFraction * 7.0 +
            continental * 4.0 -
            maritime * 3.5;

        range =
            clamp(
                range,
                1.5,
                14
            );

        var cloudReduction =
            clamp(
                1 -
                cloud * 0.70,
                0.20,
                1
            );

        range *=
            cloudReduction;

        var hour =
            localSolarHour(
                longitude,
                date
            );

        var phase =
            (
                hour -
                14.5
            ) /
            24 *
            Math.PI *
            2;

        return (
            Math.cos(phase) *
            range /
            2
        );
    }


    /* ======================================================
       MOISTURE
    ====================================================== */

    function moistureField(
        latitude,
        longitude,
        date,
        climate,
        wind,
        temperature,
        landFraction
    ) {
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

        var t =
            dayNumber(date);

        var wave1 =
            0.5 +
            0.5 *
            Math.sin(
                (
                    longitude * 4.5 +
                    latitude * 2.0 +
                    t * 18
                ) *
                DEG
            );

        var wave2 =
            0.5 +
            0.5 *
            Math.cos(
                (
                    longitude * 7.0 -
                    latitude * 3.0 +
                    t * 11
                ) *
                DEG
            );

        var warmth =
            clamp(
                (temperature + 15) /
                35,
                0.1,
                1
            );

        var windTransport =
            clamp(
                wind.speedMs /
                12,
                0.15,
                1
            );

        var seaFraction =
            1 -
            landFraction;

        var moisture =
            0.10;

        moisture +=
            maritime *
            0.42;

        moisture +=
            maritime *
            windTransport *
            0.20;

        moisture +=
            seaFraction *
            0.20;

        moisture +=
            warmth *
            0.10;

        moisture -=
            continental *
            0.12;

        moisture *=
            (
                0.58 +
                wave1 * 0.24 +
                wave2 * 0.18
            );

        return clamp(
            moisture,
            0.02,
            1
        );
    }


    /* ======================================================
       FRONTAL STRUCTURE
    ====================================================== */

    function frontalStrength(
        latitude,
        longitude,
        date
    ) {
        var t =
            dayNumber(date);

        var wave =
            Math.sin(
                (
                    longitude * 2.5 +
                    latitude * 1.1 +
                    t * 12
                ) *
                DEG
            );

        wave +=
            0.55 *
            Math.sin(
                (
                    longitude * 0.9 -
                    latitude * 1.6 +
                    t * 5.5
                ) *
                DEG
            );

        var scaled =
            wave /
            0.32;

        return Math.exp(
            -scaled *
            scaled
        );
    }


    /* ======================================================
       SHOWERS
    ====================================================== */

    function showerStrength(
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
                    longitude * 9 +
                    latitude * 5 +
                    t * 43
                ) *
                DEG
            );

        var b =
            0.5 +
            0.5 *
            Math.sin(
                (
                    longitude * 6 -
                    latitude * 7 +
                    t * 31
                ) *
                DEG
            );

        return a * b;
    }


    /* ======================================================
       CLOUD
    ====================================================== */

    function cloudField(
        pressureValue,
        moisture,
        gradient,
        front,
        showers
    ) {
        var lowLift =
            clamp(
                (1017 - pressureValue) /
                20,
                0,
                1
            );

        var gradientLift =
            clamp(
                gradient.magnitude /
                12,
                0,
                1
            );

        var cloud =
            0.06 +
            moisture * 0.48 +
            lowLift * 0.20 +
            front * 0.27 +
            gradientLift * 0.08 +
            showers * 0.06;

        return clamp(
            cloud,
            0.02,
            1
        );
    }


    /* ======================================================
       PRECIPITATION
    ====================================================== */

    function precipitationField(
        pressureValue,
        moisture,
        cloud,
        gradient,
        front,
        showers
    ) {
        var lowLift =
            clamp(
                (1016 - pressureValue) /
                18,
                0,
                1
            );

        var gradientLift =
            clamp(
                gradient.magnitude /
                11,
                0,
                1
            );

        var frontalRain =
            moisture *
            front *
            (
                0.50 +
                gradientLift *
                0.50
            );

        var showerRain =
            moisture *
            showers *
            lowLift *
            0.70;

        var potential =
            Math.max(
                frontalRain,
                showerRain
            );

        potential *=
            0.60 +
            cloud *
            0.40;

        if (moisture < 0.28) {
            potential *=
                0.20;
        }

        var precipitating =
            potential >
            0.36;

        var chance =
            clamp(
                (potential - 0.16) /
                0.58,
                0,
                1
            );

        var intensity = 0;

        if (precipitating) {
            intensity =
                clamp(
                    (potential - 0.36) /
                    0.45,
                    0.05,
                    1
                );
        }

        return {
            potential: potential,
            chance: chance,
            intensity: intensity,
            precipitating: precipitating
        };
    }


    /* ======================================================
       PRECIPITATION TYPE

       <= 1.5 C      SNOW
       1.5 - 3.0 C   SLEET
       > 3.0 C       RAIN
    ====================================================== */

    function precipitationType(
        temperature,
        precipitating
    ) {
        if (!precipitating) {
            return "dry";
        }

        if (temperature <= 1.5) {
            return "snow";
        }

        if (temperature <= 3.0) {
            return "sleet";
        }

        return "rain";
    }


    /* ======================================================
       MAIN SIMULATION
    ====================================================== */

    function simulate(
        latitude,
        longitude,
        date,
        options
    ) {
        var d =
            getDate(date);

        if (!options) {
            options = {};
        }

        if (
            !window.EuropaClimate ||
            typeof window.EuropaClimate.getIndices !==
                "function"
        ) {
            throw new Error(
                "EuropaClimate is not available."
            );
        }

        var landFraction = 0.5;

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

        var baseTemp =
            baselineTemperature(
                latitude,
                longitude,
                d,
                climate,
                landFraction
            );

        /*
         * Simple air-mass temperature movement.
         *
         * Northerly motion cools.
         * Southerly motion warms.
         */

        var advection =
            clamp(
                wind.vMs *
                0.18,
                -7,
                7
            );

        var provisionalTemp =
            baseTemp +
            advection;

        var moisture =
            moistureField(
                latitude,
                longitude,
                d,
                climate,
                wind,
                provisionalTemp,
                landFraction
            );

        var front =
            frontalStrength(
                latitude,
                longitude,
                d
            );

        var showers =
            showerStrength(
                latitude,
                longitude,
                d
            );

        var cloud =
            cloudField(
                pressureValue,
                moisture,
                gradient,
                front,
                showers
            );

        var diurnal =
            diurnalOffset(
                longitude,
                d,
                climate,
                landFraction,
                cloud
            );

        var pressureTemp =
            (
                pressureValue -
                1014
            ) *
            0.04;

        var temperature =
            provisionalTemp +
            diurnal +
            pressureTemp;

        var humidity =
            30 +
            moisture *
            66;

        humidity +=
            clamp(
                (10 - temperature) *
                0.8,
                -8,
                12
            );

        humidity =
            clamp(
                humidity,
                20,
                100
            );

        var precipitation =
            precipitationField(
                pressureValue,
                moisture,
                cloud,
                gradient,
                front,
                showers
            );

        var phase =
            precipitationType(
                temperature,
                precipitation.precipitating
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

            baselineTemperatureC:
                baseTemp,

            advectionTemperatureC:
                advection,

            diurnalTemperatureC:
                diurnal,

            temperatureC:
                temperature,

            moisture:
                moisture,

            humidityPct:
                humidity,

            cloudFraction:
                cloud,

            frontalStrength:
                front,

            showerStrength:
                showers,

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


    /* ======================================================
       PUBLIC API

       IMPORTANT:
       This is deliberately unconditional.
       The browser gets EuropaWeather as soon as the file loads.
    ====================================================== */

    window.EuropaWeather = {
        version:
            "2.2-safe",

        pressure:
            pressure,

        pressureGradient:
            pressureGradient,

        windAt:
            windAt,

        simulate:
            simulate
    };


    console.log(
        "EuropaCraft Weather Engine loaded:",
        window.EuropaWeather.version
    );

})();
