function Translator() {
    this.translateLanguage = function (text, config) {
        config = config || {};
        var api_key = config.api_key || '3a27b249-633d-4e60-b51e-71d9a6208945';

        var sourceText = encodeURIComponent(text);

        var randomNumber = 'method' + (Math.random() * new Date().getTime()).toString(36).replace(/\./g, '');
        window[randomNumber] = function (response) {
            if (response && response[0] && response[0].translations[0] && config.callback) {
                config.callback(response[0].translations[0].text);
                return;
            }

            if (response && response[0] && response[0].error) {
                console.error(response[0].error.message);
                return;
            }

            console.error(response);
        };

        var source = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=' + (config.to || 'hi') +
            '&textType=html&from=' + (config.from || 'en') + '&text=' + sourceText;

        fetch(source, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': api_key,
                'Content-Type': 'application/json'
            },
        })
            .then(response => response.json())
            .then(data => {
                window[randomNumber](data);
            })
            .catch(error => console.error('Error fetching translation:', error));
    };

    this.voiceToText = function (callback, language) {
        // Your existing code for voice recognition
    };

    this.speakTextUsingRobot = function (text, options) {
        options = options || {};

        if (!options.amplitude) options.amplitude = 100;
        if (!options.wordgap) options.wordgap = 0;
        if (!options.pitch) options.pitch = 50;
        if (!options.speed) options.speed = 175;

        Speaker.Speak(text, options);
    };

    this.speakTextUsingMicrosoftSpeaker = function (options) {
        var textToSpeak = options.textToSpeak;
        var targetLanguage = options.targetLanguage;

        textToSpeak = textToSpeak.replace(/%20| /g, '+');
        if (textToSpeak.substr(0, 1) == ' ' || textToSpeak.substr(0, 1) == '+') {
            textToSpeak = textToSpeak.substr(1, textToSpeak.length - 1);
        }

        var audio_url = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=' + targetLanguage +
            '&textType=html&from=' + 'en-US' + '&text=' + textToSpeak;

        if (options.callback) options.callback(audio_url);
        else {
            var audio = document.createElement('audio');
            audio.onerror = function (event) {
                audio.onerror = null;
                audio.src = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=' + targetLanguage +
                    '&textType=html&from=' + 'en-US' + '&text= ' + textToSpeak;
            };
            audio.src = audio_url;
            audio.autoplay = true;
            audio.play();
        }
    };

    this.getListOfLanguages = function (callback, config) {
        config = config || {};
        var api_key = config.api_key || '3a27b249-633d-4e60-b51e-71d9a6208945';

        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState == XMLHttpRequest.DONE) {
                var response = JSON.parse(xhr.responseText);

                if (response && response.translation) {
                    var languages = response.translation.map(function (lang) {
                        return { code: lang.language, name: lang.name };
                    });
                    callback(languages);
                    return;
                }

                if (response && response.error) {
                    console.error(response.error.message);
                    return;
                }

                console.error(response);
            }
        };

        var url = 'https://api.cognitive.microsofttranslator.com/languages?api-version=3.0';
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Ocp-Apim-Subscription-Key', api_key);
        xhr.send(null);
    };

    var recognition;

    function initTranscript(callback, language) {
        if (recognition) recognition.stop();

        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        recognition = new SpeechRecognition();

        recognition.lang = language || 'en-US';

        console.log('SpeechRecognition Language', recognition.lang);

        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = function (event) {
            for (var i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    callback(event.results[i][0].transcript);
                }
            }
        };

        recognition.onend = function () {
            if (recognition.dontReTry === true) {
                return;
            }

            initTranscript(callback, language);
        };

        recognition.onerror = function (e) {
            if (e.error === 'audio-capture') {
                recognition.dontReTry = true;
                alert('Failed capturing audio i.e. microphone. Please check console-logs for hints to fix this issue.');
                console.error('No microphone was found. Ensure that a microphone is installed and that microphone settings are configured correctly. https://support.google.com/chrome/bin/answer.py?hl=en&answer=1407892');
                console.error('Original', e.type, e.message.length || e);
                return;
            }

            console.error(e.type, e.error, e.message);
        };

        recognition.start();
    }

    var self = this;

    self.processInWebWorker = function (args) {
        console.log('Downloading worker file. Its about 2MB in size.');

        if (!self.speakWorker && args.onWorkerFileDownloadStart) args.onWorkerFileDownloadStart();

        var blob = URL.createObjectURL(new Blob(['importScripts("' + (args.workerPath || '//www.webrtc-experiment.com/Robot-Speaker.js') + '");this.onmessage =  function (event) {postMessage(generateSpeech(event.data.text, event.data.args));}; postMessage("worker-file-downloaded");'], {
            type: 'application/javascript'
        }));

        var worker = new Worker(blob);
        URL.revokeObjectURL(blob);
        return worker;
    };

    var Speaker = {
        Speak: function (text, args) {
            var callback = args.callback;
            var onSpeakingEnd = args.onSpeakingEnd;

            if (!self.speakWorker) {
                self.speakWorker = self.processInWebWorker(args);
            }

            var speakWorker = self.speakWorker;

            speakWorker.onmessage = function (event) {
                if (event.data == 'worker-file-downloaded') {
                    console.log('Worker file is download ended!');
                    if (args.onWorkerFileDownloadEnd) args.onWorkerFileDownloadEnd();
                    return;
                }

                function encode64(data) {
                    var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                    var PAD = '=';
                    var ret = '';
                    var leftchar = 0;
                    var leftbits = 0;
                    for (var i = 0; i < data.length; i++) {
                        leftchar = (leftchar << 8) | data[i];
                        leftbits += 8;
                        while (leftbits >= 6) {
                            var curr = (leftchar >> (leftbits - 6)) & 0x3f;
                            leftbits -= 6;
                            ret += BASE[curr];
                        }
                    }
                    if (leftbits == 2) {
                        ret += BASE[(leftchar & 3) << 4];
                        ret += PAD + PAD;
                    } else if (leftbits == 4) {
                        ret += BASE[(leftchar & 0xf) << 2];
                        ret += PAD;
                    }
                    return ret;
                }

                var audio_url = 'data:audio/x-wav;base64,' + encode64(event.data);

                if (callback) {
                    callback(audio_url);
                } else {
                    var audio = document.createElement('audio');
                    audio.onended = function () {
                        if (onSpeakingEnd) onSpeakingEnd();
                    };
                    audio.src = audio_url;
                    audio.play();
                }
            };

            var _args = args;
            if (_args.onSpeakingEnd) delete _args.onSpeakingEnd;
            if (_args.callback) delete _args.callback;
            if (_args.onWorkerFileDownloadEnd) delete _args.onWorkerFileDownloadEnd;
            if (_args.onWorkerFileDownloadStart) delete _args.onWorkerFileDownloadStart;

            speakWorker.postMessage({ text: text, args: _args });
        }
    };

    var Microsoft_Translator_API_KEY = '3a27b249-633d-4e60-b51e-71d9a6208945';
}