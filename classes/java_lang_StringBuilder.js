(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/StringBuilder", {
        '$impl': {
            '<init>$()V': function() {
                Object.defineProperty(this.$prop, "_buffer", {
                    writable: true,
                    value: ""
                });
            },
            '<init>$(Ljava/lang/String;)V': function($, string) {
                Object.defineProperty(this.$prop, "_buffer", {
                    writable: true,
                    value: string.$prop._value
                });
            },

            'append$(Ljava/lang/String;)Ljava/lang/StringBuilder;': function($, value) {
                this.$prop._buffer += value && value.$prop._value || "null";
                return this;
            },
            'append$(I)Ljava/lang/StringBuilder;': function($, value) {
                this.$prop._buffer += value;
                return this;
            },
            'append$(S)Ljava/lang/StringBuilder;': function($, value) {
                this.$prop._buffer += value;
                return this;
            },
            'append$(D)Ljava/lang/StringBuilder;': function($, value) {
                this.$prop._buffer += value;
                return this;
            },
            'append$(F)Llava/lang/StringBuilder;': function($, value) {
                this.$prop._buffer += value;
                return this;
            },
            'append$(J)Ljava/lang/StringBuilder;': function($, value) {
                this.$prop._buffer += value;
                return this;
            },
            'append$(C)Ljava/lang/StringBuilder;': function($, value) {
                this.$prop._buffer += String.fromCharCode(value);
                return this;
            },
            'append$(Ljava/lang/Object;)Ljava/lang/StringBuilder;': function($, obj) {
                this.$prop._buffer += obj !== undefined ? (obj.$prop && obj.$prop._value) || "" + obj : "null";
                return this;
            },

            'toString$()Ljava/lang/String;': function($) {
                return $.jvm.createString(this.$prop._buffer||"");
            }
        }
    });
})(JVM);
