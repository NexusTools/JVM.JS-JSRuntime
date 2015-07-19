(function(global) {
    function JavaError(msg, jclass) {
        Error.apply(this, [msg]);
        if(!this.hasOwnProperty("stack"))
            this.stack = (new Error(msg)).stack;

        this.jclass = jclass || "java/lang/RuntimeException";
        this.name = this.jclass.replace(/\//g, '.');
        this.message = msg;

        var toString = this.name + ": " + this.message;
        this.toString = function() {
            return toString;
        };

        this.convertToJavaObject = function(jvm) {
            //jvm = jvm || $currentJVM;
            //var impl = jvm.ClassLoader.loadClassImpl(this.jclass);

            throw new NotImplementedException();
        };
    };
    function JavaClassNotFoundException(msg) {
        JavaError.apply(this, [msg, "java/lang/ClassNotFoundException"]);
    }
    function JavaVirtualMachineError(msg) {
        JavaError.apply(this, [msg, "java/lang/VirtualMachineError"]);
    }
    function JavaRuntimeException(msg) {
        JavaError.apply(this, [msg, "java/lang/RuntimeException"]);
    }
    function JavaIllegalArgumentException(msg) {
        JavaError.apply(this, [msg, "java/lang/IllegalArgumentException"]);
    }
    function JavaUnsupportedOperationException(msg) {
        JavaError.apply(this, [msg, "java/lang/UnsupportedOperationException"]);
    }
    function JavaNullPointerException(msg) {
        JavaError.apply(this, [msg, "java/lang/NullPointerException"]);
    }
    function JavaNotImplementedException() {
        UnsupportedOperationException.apply(this, ["Not implemented yet."]);
    }
    function JavaUnsatisfiedLinkError(impl) {
        var msg = "Native implementation ";
        if(impl)
            msg += "for `" + impl + "` ";
        msg += "missing.";

        JavaError.apply(this, [msg, "java/lang/UnsatisfiedLinkError"]);
    }
    // END ERRORS

    global.java_notimplemented = function(){
        throw new NotImplementedException();
    };
    
    global.java_printstacktrace = function(e) {
        console.warn(e.$prop && e.$prop._stack || java_process_stack(e.stack) || ""+e);
    };
    
    global.java_nop = function() {}

    global.java_instanceof = function(obj, classname) {
        var parent = obj.$class;
        classname = classname.replace(/\//g, ".");
        while(parent) {
            if(parent.$className == classname)
                return true;
            parent = parent.$super;
        }
    };

    global.JavaErrors = {
        ClassNotFoundException: JavaClassNotFoundException,
        VirtualMachineError: JavaVirtualMachineError,
        RuntimeException: JavaRuntimeException,
        IllegalArgumentException: JavaIllegalArgumentException,
        UnsupportedOperationException: JavaUnsupportedOperationException,
        NotImplementedException: JavaNotImplementedException,
        UnsatisfiedLinkError: JavaUnsatisfiedLinkError,
        NullPointerException: JavaNullPointerException
    };
    
    global.java_is_static = function(impl) {
        return impl.hasOwnProperty("$isStatic");
    }
    global.java_static_wrap = function(impl) {
        Object.defineProperty(impl, "$isStatic", {
            value: true
        });
        return impl;
    }
    global.java_is_public = function(impl) {
        return !impl.hasOwnProperty("$notPublic");
    }
    global.java_notpublic_wrap = function(impl) {
        Object.defineProperty(impl, "$notPublic", {
            value: true
        });
        return impl;
    }
    
    var badStack = /^file\:/;
    var stackEnd = /\(([^\(\)]+)\)$/;
    global.java_process_stack = function(stack) {
        if(!JVM.settings.convertStack)
            return stack;
        
        var parts = stack.split("\n");
        var optimized = parts[0].replace(/^[^\:]+\: /, "");
        for(var i=1; i<parts.length; i++) {
            var match = parts[i].match(stackEnd);
            
            if(match && !badStack.test(match[1]))
                optimized += "\n\t" + match[1];
            else
                optimized += "\n\tjs " + parts[i];
        }
        return optimized;
    }
    
    global.java_constrain_array = function(type, array) {
        if(!array)
            return array;
        
        for(var i=0; i<array.length; i++)
            array[i] = type.constrain(array[i]);
        return array;
    }
})(this);