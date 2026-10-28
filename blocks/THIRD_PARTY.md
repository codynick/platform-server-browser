# CH340 protocol reference

ch340-usb.js implements a site-local WebUSB transport for CH340 1A86:7523.
CH340 initialization, baud-divisor and control-register behavior was adapted
from usb-serial-for-android's Ch34xSerialDriver.java:
https://github.com/mik3y/usb-serial-for-android/blob/master/usbSerialForAndroid/src/main/java/com/hoho/android/usbserial/driver/Ch34xSerialDriver.java

Copyright 2014 Andreas Butti and subsequent contributors.
Upstream project license:

MIT License

Copyright (c) 2011-2013 Google Inc.
Copyright (c) 2013 Mike Wakerly

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Blockly and uploaded project attribution remains as described in README.md and
vendor/blockly/LICENSE.
