(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/Throwable", {
        '$impl': {
            '<init>$()V': function($) {
                Object.defineProperty(this.$prop, "_stack", {
                    value: $.jclass.$className + ": " + java_process_stack(new Error().stack)
                });
                Object.defineProperty(this.$prop, "_message", {
                    value: null
                });
            },
            '<init>$(Ljava/lang/String;)V': function($, msg) {
                msg = msg.$prop._value;

                //console.log($, arguments);
                Object.defineProperty(this.$prop, "_stack", {
                    value: $.jclass.$className + ": " + java_process_stack(new Error(msg).stack)
                });
                Object.defineProperty(this.$prop, "_message", {
                    value: msg
                });
            },
            'printStackTrace$()V': function() {
                console.warn(this.$prop._stack);
            },
            'toString$()Ljava/lang/String;': function($) {
                return $.jvm.createString(this.$class.$className + ": " + this.$prop._message);
            }
        }
    });
})(JVM);