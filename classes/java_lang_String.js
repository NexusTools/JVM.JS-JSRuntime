(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/String", {
        '$impl': {
            '<init>$()V': function() {
                Object.defineProperty(this.$prop, "_value", {
                    value: value
                });
            },
            'hashCode$()I': function($) {
                //console.log("Calculating hash", this, $);
                var local = this.$prop;

                if (local.hasOwnProperty("_hash"))
                    return local.hash;
                else {
                    //console.log("Calculating hash for", local._value);

                    var h = 0;
                    for (var i = 0; i < local._value.length; i++)
                        h = 31*h + local._value.charCodeAt(i);
                    Object.defineProperty(local, "_hash", {
                        value: h
                    });
                    return h;
                }
            },

            'valueOf$(I)Ljava/lang/String;': java_static_wrap(function($, val) {
                return $.jvm.createString(""+val);
            }),
            'valueOf$(D)Ljava/lang/String;': java_static_wrap(function($, val) {
                return $.jvm.createString(""+val);
            })
        }
    });
})(JVM);