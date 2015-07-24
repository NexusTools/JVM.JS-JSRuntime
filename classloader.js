(function(global) {
    var initMethod = /init\>$/;
    var method_name_parts = /^(.+)\$\((.*)\)(.+)$/;
    function defineUserSpace(impl, static, target) {
        var userMethods;
        var cache = "$userSpaceMethods" + static ? "Static" : "Local";
        if(!impl.hasOwnProperty(cache)) {
            //console.log("Gathering public " + (static ? "static" : "local") + " methods", impl.$javaName);

            var methods = {}, methodNames = [];
            var parent = impl;
            while(parent) {
                for(var key in parent.$impl) {
                    var parts = key.match(method_name_parts);
                    if(!parts)
                        continue; // Skip non-java methods, internal use stuff
                    if(initMethod.test(parts[1]) && (static || parent !== impl))
                        continue; // Skip init methods for other classes and statics
                    var funcName = "$" + parts[1];

                    //console.log(key, funcName);
                    var func = parent.$impl[key];
                    if(!java_is_public(func))
                        continue;

                    if(java_is_static(func) != static)
                        continue;

                    var variants;
                    if(!(funcName in methods)) {
                        methodNames.push(parts[1]);
                        variants = methods[funcName] = {};
                    } else
                        variants = methods[funcName];

                    if(!(parts[2] in variants))
                        variants[parts[2]] = func;
                }


                parent = parent.$super;
            }

            userMethods = {};
            //console.log("Detected methods", impl.$javaName, methodNames);
            methodNames.forEach(function(name) {
                var impls = methods['$' + name];
                var implSigs = Object.keys(impls);

                if(implSigs.length == 1) {
                    var impl = impls[implSigs[0]];
                    if(implSigs[0] == "")
                        userMethods[name] = function basic_user_method_wrapper() {
                            if(arguments.length > 0)
                                throw new JavaErrors.IllegalArgumentException("This method expects no arguments.");

                            return impl.call(this);
                        };
                }
            });

            //console.log("Created user methods", userMethods);
            Object.defineProperty(impl, cache, {
                value: userMethods
            });
        } else
            userMethods = impl[cache];

        for(var key in userMethods)
            target[key] = userMethods[key].bind(target);
    }
    function createUserAccess(impl) {
        return function() {
            Object.defineProperty(this, '$class', {
                value: impl
            });

            defineUserSpace(impl, false, this);
        };
    }

    global.JavaClassLoader = function ClassLoader(jvm) {
        Object.defineProperty(this, "$jvm", {
            value: jvm
        });
        Object.defineProperty(this, "definedClasses", {
            value: {}
        });
        Object.defineProperty(this, "loadedClasses", {
            value: {}
        });
        Object.defineProperty(this, "nativeClasses", {
            value: {}
        });
        Object.defineProperty(this, "$classes", {
            value: {}
        });
    };
    JavaClassLoader.prototype.lookupImpl = function(obj, method) {
        if(obj == null)
            throw new JavaErrors.NullPointerException();

        var impl;
        if(impl = obj.$vcache[method])
            return impl;

        var parent = obj.$class;
        while(parent != null) {
            if(method in parent.$impl)
                return obj.$vcache[method] = parent.$impl[method];
            parent = parent.$super;
        }
        throw new JavaErrors.VirtualMachineError("Cannot resolve implementation for `" + method + "` of `" + obj.$class + "`");
    };
    JavaClassLoader.prototype.initImpl = function(name, friendlyName) {
        friendlyName = friendlyName || name.replace(/[^\w\$]/g, "_");

        var $self = this;
        var impl = eval("(function " + friendlyName + "() {this['<init>'].apply(this, arguments);})");
        Object.defineProperty(impl, "$javaName", {
            value: name
        });
        Object.defineProperty(impl, "$className", {
            value: name.replace(/\//g, ".")
        });
        Object.defineProperty(impl, "class", {
            configurable: true,
            get: function() {
                var classImpl = $self.loadClassImpl("java/lang/Class");
                var classInst = $self.$jvm.newObject();

                classImpl.$impl._.call(classInst);
                classImpl.$impl.__.call(classInst, impl);

                Object.defineProperty(impl, "class", {
                    value: classInst
                });
                return classInst;
            }
        });
        impl.toString = function() {
            return name;
        };

        return impl;
    };
    JavaClassLoader.prototype.registerImpl = function(name, impl) {
        if(JVM.settings.verbose) {
            console.log("Registering Implementation");
            console.dir(impl);
        }

        impl.$method = function(method) {
            var found = impl.$impl[method];
            if(!found)
                throw new JavaErrors.VirtualMachineError("No such method `" + method + "` exists in `" + name + "`.");
            return found;
        };

        impl.$impl['_'] = createUserAccess(impl);
        if(impl.$impl.hasOwnProperty("<init>$()V")) {
            var _ = impl.$impl['_'];
            var init = impl.$method('<init>$()V');

            var jvm = this.$jvm;
            Object.defineProperty(impl, "$new", {
                value: function() {
                    var object = jvm.newObject();
                    _.call(object);
                    init.call(object);
                    return object;
                }
            });
        }



        var registry = this.$classes;
        var parts = name.split("/");
        //console.log("Registering", parts);

        var cname = parts.pop();
        parts.forEach(function(pkg) {
            if(!(pkg in registry))
                registry[pkg] = {};
            registry = registry[pkg];
        });
        registry[cname] = impl;
        this.loadedClasses[name] = impl;
    };
    JavaClassLoader.prototype.defineClass = function(name, interfaces, parent, impl) {
        if(name in this.loadedClasses)
            throw new JavaErrors.VirtualMachineError(name.replace(/\//g, '.') + " is already loaded.");
        if(name in this.definedClasses)
            throw new JavaErrors.VirtualMachineError(name.replace(/\//g, '.') + " is already defined.");

        if(JVM.settings.verbose)
            console.log("Defining class", name);
        this.definedClasses[name] = [interfaces, parent, impl];
    };

    JavaClassLoader.prototype.defineNativeImpl = function(name, impl) {
        if(!(name in this.definedClasses))
            throw new JavaErrors.ClassNotFoundException(name + " has not been defined.");
        if(name in this.nativeClasses)
            throw new JavaErrors.VirtualMachineError(name + " already has a native implementation.");

        if(JVM.settings.verbose)
            console.trace("Registering Native implementation", name, impl);

        this.nativeClasses[name] = impl;
        var loadedClass = this.loadedClasses[name];
        if(loadedClass)
            for(var key in impl)
                loadedClass.$native[key] = impl[key];
    };

    var BLOCK_TRY = 0, BLOCK_LABEL = 1;
    JavaClassLoader.prototype.loadClassImpl = function(name) {
        if(name in this.loadedClasses)
            return this.loadedClasses[name];

        var classID = name.replace(/\//g, '.');
        var builtIn = JVM.BuiltInClasses[name];
        if(builtIn) {
            var impl = this.initImpl(name);
            var $impl = builtIn;
            var imp = $impl['$impl'] || {};

            for(var key in imp) {
                (function(f) {
                    imp[key] = function jvm_builtin_wrapper() {
                        try {
                            var args = Array.prototype.slice.call(arguments, 0);
                            args.unshift({
                                jvm: jvm,
                                jclass: impl
                            });

                            return f.apply(this, args);
                        } catch(e) {
                            console.log(e.stack||e);
                        }
                    };
                })(imp[key]);
            }

            Object.defineProperty(impl, "$jvm", {
                value: this.jvm
            });
            Object.defineProperty(impl, "$impl", {
                value: imp
            });
            Object.defineProperty(impl, "$prop", {
                value: $impl['$prop'] || {}
            });

            var parentClass;
            if(name != "java/lang/Object") {

                if(JVM.settings.verbose)
                  console.log(name, "Loading parent", $impl);
                parentClass = this.loadClassImpl($impl['$super'] || "java/lang/Object");
                if(parentClass == null)
                  throw new JavaErrors.NullPointerException();

                if(JVM.settings.verbose)
                  console.log(name, parentClass);

                Object.defineProperty(impl, "$super", {
                    value: parentClass
                });
            }

            if(!imp.hasOwnProperty('<init>$()V')) {
                if(parentClass) // Skip upwards
                    imp['<init>$()V'] = parentClass.$impl['<init>$()V'];
                else
                    imp['<init>$()V'] = java_nop;
            }
            this.registerImpl(name, impl);
            return impl;
        }

        var classDefinition = this.definedClasses[name];
        if(!classDefinition)
            throw new JavaErrors.ClassNotFoundException(classID + " is not defined in this JVM instance.");
        this.loadedClasses[name] = true;

        if(JVM.settings.verbose)
            console.log("Loading class", name);

        var friendlyName;
        var impl = this.initImpl(name, friendlyName = name.replace(/[^\w\$]/g, "_"));
        var parentClass = this.loadClassImpl(classDefinition[1]);

        var $self = this;
        var $prop = {}, $impl = {}, $native, $nativeData, references = [];
        Object.defineProperty(impl, "$prop", {
            value: $prop
        });
        Object.defineProperty(impl, "$impl", {
            value: $impl
        });
        Object.defineProperty(impl, "$super", {
            value: parentClass
        });
        Object.defineProperty(impl, "$jvm", {
            value: $self.$jvm
        });

        var inits = [];
        classDefinition[2].forEach(function(section) {
            switch(section.type) {
                case "references":
                    references = section.value;
                    break;

                case "method":
                    //console.log("Processing method", section);

                    var isStatic = section.access.indexOf(JVM.Flags.STATIC) != -1;
                    var id = section.name + "$" + section.signature;
                    var methodID = classID + "." + section.name;
                    var friendlyID = friendlyName + "_$$_" + id.replace(/[^\w$]/g, "_");
                    var source = "//@ sourceURL=" + methodID;
                    source += "\n\nvar $ = this;";
                    var bodysource = "function " + friendlyID + "() {", initSource = "";

                    var isNative = true;
                    try {
                        if(section.implementation instanceof Array)
                            isNative = false;
                    } catch(e) {}

                    if(isNative) {
                        if(!$native) {
                            Object.defineProperty(impl, "$native", {
                                value: $native = {}
                            });
                            Object.defineProperty(impl, "$nativeData", {
                                value: $nativeData = {}
                            });
                        }

                        var native = $self.nativeClasses[name];
                        $native[id] = (native && native[id]) || function() {
                            var native = $self.nativeClasses[name];
                            if(native && native[id]) {
                              $native[id] = native[id];
                              return native[id].apply(this, arguments);
                            }

                            if(!native)
                              console.error("Native class no registered", native);
                            else
                              console.error("Cannot find ", id, "in", native);
                            throw new JavaErrors.UnsatisfiedLinkError(classID + "." + id);
                        };

                        source += "\nvar impl = $.native['" + id + "'];";
                        source += "\nvar helper = {jvm: $.jvm, 'shared': $.nativeData, impl: $.impl};";
                        bodysource += "\n\treturn impl.call(this, helper";
                        for(var i=0; i<section.sigparts.args.length; i++) {
                            bodysource += ", arguments[" + i + "]";
                        }
                        bodysource += ");"
                    } else {
                            var crash = false;
                        bodysource += "\n\tvar STACK=[], TARGET, IMPL;";
                        try {
                            var depth = "\n\t";

                            var optimized = [], hasReturn, hasJumps, labels, hasTryCatch, startJumper = true;
                            section.implementation.forEach(function(impl) {
                                switch(impl.type) {
                                    case "try": //Skip
                                        hasTryCatch = hasReturn = true;
                                    case "jump":
                                    case "switch":
                                    case "switchtable":
                                        hasJumps = true;
                                        break;
                                }
                            });

                            if(!hasJumps)
                                section.implementation.forEach(function(impl) {
                                    switch(impl.type) {
                                        case "label": //Skip
                                        case "declare":
                                            break;

                                        case "insn":
                                            switch(impl.opcode) {
                                                case JVM.Opcodes.D2I:
                                                case JVM.Opcodes.I2D:
                                                case JVM.Opcodes.D2F:
                                                    return;
                                            }
                                        default:
                                            optimized.push(impl);
                                    }
                                });
                            else {
                                labels = [];
                                section.implementation.forEach(function(impl) {
                                    switch(impl.type) {
                                        case "declare": //Skip
                                            break;

                                        case "label": //Skip
                                            labels.push(impl.name);
                                        case "insn":
                                            switch(impl.opcode) {
                                                case JVM.Opcodes.D2I:
                                                case JVM.Opcodes.I2D:
                                                case JVM.Opcodes.D2F:
                                                    return;
                                            }
                                        default:
                                            optimized.push(impl);
                                    }
                                });
                            }

                            var tryCatchPending = [];
                            if(hasTryCatch) {
                                var tryCatchImpl = []
                                optimized.forEach(function(impl) {
                                    switch(impl.type) {
                                        case "try":
                                            tryCatchPending.push(impl);
                                            break;

                                        default:
                                            tryCatchImpl.push(impl);
                                    }
                                });
                                optimized = tryCatchImpl;

                                console.error("Detected try catches", tryCatchPending);
                            }

                            if(true) { // Loose
                                var looseImplementation = []
                                optimized.forEach(function(impl) {
                                    switch(impl.type) {
                                        case "type":
                                            switch(impl.opcode) {
                                                case JVM.Opcodes.CHECKCAST:
                                                    return;
                                            }
                                            looseImplementation.push(impl);
                                            break;

                                        case "insn":
                                            switch(impl.opcode) {
                                                case JVM.Opcodes.I2L:
                                                case JVM.Opcodes.I2F:
                                                case JVM.Opcodes.I2D:
                                                case JVM.Opcodes.L2I:
                                                case JVM.Opcodes.L2F:
                                                case JVM.Opcodes.L2D:
                                                case JVM.Opcodes.F2I:
                                                case JVM.Opcodes.F2L:
                                                case JVM.Opcodes.F2D:
                                                case JVM.Opcodes.D2I:
                                                case JVM.Opcodes.D2L:
                                                case JVM.Opcodes.D2F:
                                                case JVM.Opcodes.I2B:
                                                case JVM.Opcodes.I2C:
                                                case JVM.Opcodes.I2S:
                                                    return;
                                            }
                                        default:
                                            looseImplementation.push(impl);
                                    }
                                });
                                optimized = looseImplementation;
                            }

                            if(hasJumps && optimized[0].type != "label") {
                                optimized.pop();
                                optimized.push({
                                    type: "reset"
                                });
                                while(optimized[0].type != "label")
                                    optimized.push(optimized.shift());
                                optimized.push({
                                    type: "end"
                                });
                            }

                            var ref = {}, methodRef = {}, addRef, addMethodRef, addStringRef, stringRef = [];
                            if(JVM.settings.allowOpt) {
                                var classRefCount = 0;
                                addRef = function(name) {
                                    if(!ref.hasOwnProperty(name))
                                        return ref[name] = "class" + (classRefCount++);
                                    return ref[name];
                                };

                                var methodRefCount = 0;
                                addMethodRef = function(jclass, name) {
                                    var nameID = jclass + "@" + name;
                                    var classID = addRef(jclass);

                                    if(!methodRef.hasOwnProperty(nameID))
                                        methodRef[nameID] = [classID, "method" + (methodRefCount++), name];
                                    return methodRef[nameID];
                                };

                                addStringRef = function(value) {
                                  var index = stringRef.indexOf(value);
                                  if(index == -1) {
                                    index = stringRef.length;
                                    stringRef.push(value);
                                  }
                                  return index;
                                };

                                // Basic no argument super
                                if(section.name == "<init>" && optimized[0].type == "var" && optimized[0].opcode == JVM.Opcodes.ALOAD && optimized[0].index == 0
                                        && optimized[1].type == "method" && optimized[1].name == "<init>" && optimized[1].opcode == JVM.Opcodes.INVOKESPECIAL) {

                                    optimized.shift();
                                    optimized[0] = {
                                        type: "super",
                                        ref: addMethodRef(optimized[0].owner, "<init>$()V")
                                    };
                                }

                                var secondLast = optimized.length-2; // Strip last return
                                if(!hasJumps && secondLast >= 0 && optimized[secondLast].type == "insn") {
                                    if(optimized[secondLast].opcode == JVM.Opcodes.RETURN) {
                                        optimized.splice(secondLast, 1);
                                    } else if(optimized[secondLast].opcode == JVM.Opcodes.ARETURN) {
                                        optimized[secondLast] = {
                                            type: "return"
                                        };
                                    }
                                }

                                if(optimized.length == 1) {
                                    //if(section.access.indexOf(JVM.Flags.ABSTRACT) != -1)
                                      optimized.unshift({
                                          type: "virtual"
                                      });
                                }

                                var moreOptimized = [], stringRefs = 0, skipUntilLabel;
                                optimized.forEach(function simple_optimizations(impl) {
                                    if(skipUntilLabel) {
                                        if(impl.type == "label")
                                            skipUntilLabel = false;
                                        else
                                            return;
                                    }

                                    switch(impl.type) {
                                      case "method":
                                        switch(impl.opcode) {
                                          case JVM.Opcodes.INVOKESTATIC:
                                            impl.opcode = JVM.Opcodes.INVOKESTATICREF;
                                            impl.ref = addMethodRef(impl.owner, impl.name + "$" + impl.signature.raw);
                                            break;
                                          case JVM.Opcodes.INVOKEVIRTUAL:
                                            /*if(impl.owner == "java/lang/StringBuilder" && impl.name == "append") {
                                              impl.opcode = JVM.Opcodes.APPEND;
                                              crash = true;
                                              break;
                                            }*/

                                            var implSig = impl.name + "$" + impl.signature.raw;
                                            try {
                                              var ownerImpl = $self.loadClassImpl(impl.owner);
                                              var funcImpl = ownerImpl.$method(implSig);
                                              if(funcImpl.$flags.indexOf(JVM.Flags.FINAL)) {
                                                impl.ref = addMethodRef(impl.owner, implSig);
                                                impl.opcode = JVM.Opcodes.INVOKESPECIALREF;
                                              }
                                            } catch(e) {}
                                            break;
                                          case JVM.Opcodes.INVOKESPECIAL:
                                            impl.opcode = JVM.Opcodes.INVOKESPECIALREF;
                                            impl.ref = addMethodRef(impl.owner, impl.name + "$" + impl.signature.raw);

                                            if(impl.name == "<init>")
                                              impl.initref = addMethodRef(impl.owner, "_");
                                            break;
                                        }
                                        break;
                                    }

                                    if(impl.type == "field" && impl.opcode == JVM.Opcodes.PUTSTATIC) {
                                        impl.opcode = JVM.Opcodes.PUTSTATICREF;
                                        impl.ref = addRef(impl.class);
                                    } else if(impl.type == "field" && impl.opcode == JVM.Opcodes.GETSTATIC) {
                                        impl.opcode = JVM.Opcodes.GETSTATICREF;
                                        impl.ref = addRef(impl.class);
                                    } else if(impl.type == "ldc" && impl.hasOwnProperty("stringValue")) {
					                              /*source += "\nvar string" + stringRefs + ";";
                                        bodysource += "\n\tvar string" + stringRefs + " = $.jvm.createString(";
                                        bodysource += JSON.stringify(impl.stringValue);
                                        bodysource += ");"*/

                                        impl.stringRef = addStringRef(impl.stringValue);
                                    } else if(impl.type == "jump" && impl.opcode == JVM.Opcodes.JUMP)
                                        skipUntilLabel = true;

                                    moreOptimized.push(impl);
                                });
                                optimized = moreOptimized;
                            }

                            if(JVM.settings.dumpOptimizations)
                                console.log("Optimized", optimized, section.implementation);
                            var hasMalleableLocal = false;
                            optimized.forEach(function (impl){
                                switch(impl.type) {
                                    case "insn":
                                        switch(impl.opcode) {
                                            case JVM.Opcodes.IRETURN:
                                            case JVM.Opcodes.LRETURN:
                                            case JVM.Opcodes.FRETURN:
                                            case JVM.Opcodes.DRETURN:
                                            case JVM.Opcodes.ARETURN:
                                            case JVM.Opcodes.RETURN:
                                                hasReturn = true;
                                        }
                                        break;

                                    case "var":
                                        switch(impl.opcode) {
                                            case JVM.Opcodes.LSTORE:
                                            case JVM.Opcodes.ASTORE:
                                                hasMalleableLocal = true;
                                        }
                                        break;
                                }
                            });
                            var NEEDSARGS = hasMalleableLocal || hasJumps;
                            var ARGSNAME = NEEDSARGS ? "ARGS" : "arguments";

                            if(JVM.settings.allowOpt) {
                                if(JVM.settings.optPasses) {
                                    var optimizations = [
                                        function simple_new_object(analysisSet) {
                                            if(analysisSet[0].type == "type"
                                                    && analysisSet[0].opcode == JVM.Opcodes.NEW
                                                    && analysisSet[1].type == "insn"
                                                    && analysisSet[1].opcode == JVM.Opcodes.DUP
                                                    && analysisSet[2].type == "method"
                                                    && (analysisSet[2].opcode == JVM.Opcodes.INVOKESPECIAL
                                                    || analysisSet[2].opcode == JVM.Opcodes.INVOKESPECIALREF)
                                                    && !analysisSet[2].signature.args.length) {

                                                analysisSet.splice(0, 3, {
                                                    type: "new",
                                                    ref: addRef(analysisSet[2].owner)
                                                });
                                            }
                                        },
                                        function get_field(analysisSet) {
                                            if(analysisSet[0].type == "var"
                                                    && analysisSet[0].opcode == JVM.Opcodes.ALOAD
                                                    && analysisSet[1].type == "field"
                                                    && analysisSet[1].opcode == JVM.Opcodes.GETFIELD) {

                                                analysisSet.splice(0, 2, {
                                                    type: "field",
                                                    name: analysisSet[1].name,
                                                    opcode: JVM.Opcodes.GETALOAD,
                                                    index: analysisSet[0].index
                                                });
                                            }
                                        }
                                    ];

                                    var subPasses = Math.max(1, JVM.settings.optSubPasses||1);
                                    var optimizePass = function(implementation) {
                                        var complete = [], analysisSet = [];

                                        var analyze = function(analysisSet) {
                                            optimizations.forEach(function(opt) {
                                                try {
                                                    opt(analysisSet);
                                                } catch(e) {
                                                    console.warn(e);
                                                }
                                            });

                                        };
                                        implementation.forEach(function(impl) {
                                            analysisSet.push(impl);
                                            if(analysisSet.length >= 20) {
                                                for(var i=0; i<subPasses; i++)
                                                    analyze(analysisSet);
                                                complete.push(analysisSet.shift());
                                            }
                                        });
                                        while(analysisSet.length >= 2) {
                                            for(var i=0; i<subPasses; i++)
                                                analyze(analysisSet);
                                            complete.push(analysisSet.shift());
                                        }
                                        while(analysisSet.length >= 1)
                                            complete.push(analysisSet.shift());

                                        return complete;
                                    }

                                    for(var i=0; i<JVM.settings.optPasses; i++) {
                                        optimized = optimizePass(optimized);
                                    }
                                }

                                if(Object.keys(ref).length || stringRef.length) {
                                    initSource = "function() {";
                                    for(var i=0; i<stringRef.length; i++) {
                                        source += "\nvar string" + i + ";";
                                        initSource += "\n\tstring" + i + " = $.jvm.createString(";
                                        initSource += JSON.stringify(stringRef[i]);
                                        initSource += ");"
                                    }
                                    for(var key in ref) {
                                        source += "\nvar " + ref[key] + ";";
                                        initSource += "\n\t" + ref[key] + " = $.classloader.loadClassImpl(";
                                        initSource += JSON.stringify(key) + ");";
                                    }
                                    if(Object.keys(methodRef).length) {
                                        for(var key in methodRef) {
                                            var data = methodRef[key];

                                            source += "\nvar " + data[1] + ";";
                                            initSource += "\n\t" + data[1] + " = " + data[0];
                                            initSource += ".$method(" + JSON.stringify(data[2]) + ");";
                                        }
                                    }
                                    initSource += "\n}";
                                }
                            }


                            if(NEEDSARGS) {
                                bodysource += depth + "var ARGS = ";
                                if(hasMalleableLocal)
                                    bodysource += "Array.prototype.slice.call(";
                                bodysource += "arguments";
                                if(hasMalleableLocal) {
                                    bodysource += ", 0);";
                                } else
                                    bodysource += ";";
                            }
                            if(hasReturn) {
                                bodysource += depth + "var RET = function(val){this.val=val;};";
                                bodysource += depth + "try {";
                                depth += "\t";
                            }
                            if(hasJumps) {
                                bodysource += depth + "var JUMPER = $.jvm.createJumper(RET);";
                            }

                            bodysource += depth;
                            var $new, depthStack = [];
                            var resetDepth = function(to) {
                                while(depthStack.length) {
                                    depth = depth.substring(0, depth.length-1);
                                    var frame = depthStack.pop();
                                    switch(frame[0]) {
                                        case BLOCK_TRY:
                                            bodysource += depth + "} catch(e) {";
                                            bodysource += depth + "\te = $.jvm.convertError(e);";

                                            // TODO: Loop through other available stack entries
                                            bodysource += depth + "\tif(java_instanceof(e, '";
                                            bodysource += frame[1].catch;
                                            bodysource += "')) {";
                                            bodysource += depth + "\t\tSTACK.push(e);";
                                            bodysource += depth + "\t\tJUMPER.jump(" + labels.indexOf(frame[1].handler) + ", this);";
                                            bodysource += depth + "\t}";

                                            bodysource += depth + "\tthrow e;";

                                            bodysource += depth + "}";
                                            break;

                                        case BLOCK_LABEL:
                                            bodysource += depth + "\tJUMPER.next(this);";
                                            bodysource += depth + "});";
                                            break;

                                        default:
                                            throw new Error("Unhandled depth type");
                                    }
                                    if(frame[0] === to)
                                        break;
                                }
                            }
                            var addDepth = function(type, inst) {
                                depthStack.push([type, inst]);
                                depth += "\t";
                            };

                            var stackControl = {
                                add: addDepth,
                                reset: resetDepth,

                                TRY: BLOCK_TRY,
                                LABEL: BLOCK_LABEL
                            }

                            var tryCatch = [];
                            optimized.forEach(function(impl) {
                                if(JVM.settings.dumpImpl)
                                    bodysource += depth + "// " + JSON.stringify(impl);


                                switch(impl.type) {
                                    case "return":
                                        bodysource += depth + "return STACK.pop();";
                                        break;

                                    case "new":
                                        bodysource += depth + "STACK.push(" + impl.ref + ".$new());";
                                        break;

                                    case "reset":
                                        resetDepth();
                                        break;

                                    case "jump":
                                        var more = "\t";
                                        switch(impl.opcode) {
                                            case JVM.Opcodes.IF_ICMPEQ:
                                                bodysource += depth + "if(STACK.pop() === STACK.pop())";
                                                break;

                                            case JVM.Opcodes.IF_ACMPNE:
                                                bodysource += depth + "if(STACK.pop() !== STACK.pop())";
                                                break;

                                            case JVM.Opcodes.IF_ICMPLT:
                                                bodysource += depth + "if(STACK.pop() > STACK.pop())";
                                                break;

                                            case JVM.Opcodes.IF_ICMPLE:
                                                bodysource += depth + "if(STACK.pop() >= STACK.pop())";
                                                break;

                                            case JVM.Opcodes.IF_ICMPGT:
                                                bodysource += depth + "if(STACK.pop() < STACK.pop())";
                                                break;

                                            case JVM.Opcodes.IF_ICMPGE:
                                                bodysource += depth + "if(STACK.pop() <= STACK.pop())";
                                                break;

                                            case JVM.Opcodes.IFGE:
                                                bodysource += depth + "if(STACK.pop() >= 0)";
                                                break;

                                            case JVM.Opcodes.IFGT:
                                                bodysource += depth + "if(STACK.pop() > 0)";
                                                break;

                                            case JVM.Opcodes.IFLE:
                                                bodysource += depth + "if(STACK.pop() <= 0)";
                                                break;

                                            case JVM.Opcodes.IFLT:
                                                bodysource += depth + "if(STACK.pop() < 0)";
                                                break;

                                            case JVM.Opcodes.IFEQ:
                                                bodysource += depth + "if(!STACK.pop())";
                                                break;

                                            case JVM.Opcodes.IFNE:
                                                bodysource += depth + "if(STACK.pop())";
                                                break;

                                            case JVM.Opcodes.GOTO:
                                                more = "";
                                                break;

                                            default:
                                                throw new Error("Unknown jump opcode: " + impl.opcode);
                                        }

                                        bodysource += depth + more + "JUMPER.jump(" + labels.indexOf(impl.name) + ", this); // JUMP";
                                        break;

                                    case "label":
                                        resetDepth(BLOCK_LABEL);

                                        bodysource += depth + "JUMPER.push(function " + impl.name + "() {";
                                        addDepth(BLOCK_LABEL);

                                        var tryCatchRemaining;
                                        if(tryCatchPending.length) {
                                            tryCatchRemaining = [];
                                            tryCatchPending.forEach(function(tryImpl) {
                                                if(tryImpl.start == impl.name) {
                                                    tryCatch.push(tryImpl);
                                                } else
                                                    tryCatchRemaining.push(tryImpl);
                                            });
                                            tryCatchPending = tryCatchRemaining;
                                        }

                                        if(tryCatch.length) {
                                            tryCatchRemaining = [];
                                            tryCatch.forEach(function(tryImpl) {
                                                if(tryImpl.end == impl.name)
                                                    return;

                                                bodysource += depth + "try {";
                                                addDepth(BLOCK_TRY, tryImpl);

                                                tryCatchRemaining.push(tryImpl);
                                            });
                                            tryCatch = tryCatchRemaining;
                                        }

                                        break;

                                    case "type":
                                        switch(impl.opcode) {
                                            case JVM.Opcodes.NEW:
                                                bodysource += depth + "STACK.push($.jvm.newObject());";
                                                if(JVM.settings.dumpStack) {
                                                    bodysource += depth + "STACK[STACK.length-1].$class={$className:'UNINITIALIZED'};";
                                                    bodysource += depth + "STACK[STACK.length-1].$prop={};";
                                                }
                                                $new = true;
                                                break;

                                            case JVM.Opcodes.NEWARRAY:
                                            case JVM.Opcodes.ANEWARRAY:
                                                bodysource += depth + "STACK.push([]);";
                                                break;

                                            default:
                                                throw new Error("Unknown type opcode: " + impl.opcode);
                                        }
                                        break;

                                    case "virtual":
                                        bodysource += depth + "throw new $.error.VirtualMachineError('Pure Virtual Method');";
                                        break;

                                    case "field":
                                        switch(impl.opcode) {
                                            case JVM.Opcodes.GETSTATIC:
                                                bodysource += depth + "STACK.push($.classloader.loadClassImpl(" + JSON.stringify(impl.class) + ").$prop[" + JSON.stringify(impl.name) + "]);";
                                                break;

                                            case JVM.Opcodes.PUTSTATIC:
                                                bodysource += depth + "$.classloader.loadClassImpl(" + JSON.stringify(impl.class) + ").$prop[" + JSON.stringify(impl.name) + "] = STACK.pop();";
                                                break;

                                            case JVM.Opcodes.PUTSTATICREF:
                                                bodysource += depth + impl.ref + ".$prop[" + JSON.stringify(impl.name) + "] = STACK.pop();";
                                                break;

                                            case JVM.Opcodes.GETSTATICREF:
                                                bodysource += depth + "STACK.push(" + impl.ref + ".$prop[" + JSON.stringify(impl.name) + "]);";
                                                break;

                                            case JVM.Opcodes.GETFIELD:
                                                if(JVM.settings.dumpStack)
                                                    bodysource += depth + "console.log(\"GETFIELD\", " + JSON.stringify(impl.name) + ", $.jvm.dumpStack(STACK));";

                                                bodysource += depth + "STACK.push(STACK.pop().$prop[" + JSON.stringify(impl.name) + "]);";
                                                break;

                                            case JVM.Opcodes.PUTFIELD:
                                                if(JVM.settings.dumpStack)
                                                    bodysource += depth + "console.log(\"PUTFIELD\", " + JSON.stringify(impl.name) + ", $.jvm.dumpStack(STACK));";

                                                bodysource += depth + "TARGET = STACK.pop();";
                                                bodysource += depth + "STACK.pop().$prop[" + JSON.stringify(impl.name) + "] = TARGET;";
                                                break;

                                            case JVM.Opcodes.GETALOAD:
                                                bodysource += depth + "STACK.push(";
                                                impl.index--;
                                                if(impl.index < 0)
                                                    bodysource += "this";
                                                else
                                                    bodysource += ARGSNAME + "[" + impl.index + "]";
                                                bodysource += ".$prop[" + JSON.stringify(impl.name) + "]);";
                                                break;

                                            default:
                                                throw new Error("Unknown field opcode: " + impl.opcode);
                                        }
                                        break;

                                    case "declare":
                                        break;

                                    case "end":
                                        if(hasJumps) {
                                            resetDepth();
                                            bodysource += depth + "JUMPER.start(this);";
                                        }
                                        break;

                                    case "insn":
                                        switch(impl.opcode) {
                                            case JVM.Opcodes.POP:
                                                bodysource += depth + "STACK.pop();";
                                                break;

                                            case JVM.Opcodes.ATHROW:
                                                bodysource += depth + "throw STACK.pop();";
                                                break;

                                            case JVM.Opcodes.ACONST_NULL:
                                                bodysource += depth + "STACK.push(null);";
                                                break;

                                            case JVM.Opcodes.RETURN:
                                                bodysource += depth + "throw new RET();";
                                                break;

                                            case JVM.Opcodes.FCMPL:
                                            case JVM.Opcodes.DCMPL:
                                                bodysource += depth + "TARGET=[STACK.pop(),STACK.pop()];";
                                                bodysource += depth + "if(TARGET[0] == TARGET[1])";
                                                bodysource += depth + "\tSTACK.push(0);";
                                                bodysource += depth + "else if(TARGET[0] < TARGET[1])";
                                                bodysource += depth + "\tSTACK.push(-1);";
                                                bodysource += depth + "else";
                                                bodysource += depth + "\tSTACK.push(1);";
                                                break;

                                            case JVM.Opcodes.FCMPG:
                                            case JVM.Opcodes.DCMPG:
                                                bodysource += depth + "TARGET=[STACK.pop(),STACK.pop()];";
                                                bodysource += depth + "if(TARGET[0] == TARGET[1])";
                                                bodysource += depth + "\tSTACK.push(0);";
                                                bodysource += depth + "else if(TARGET[0] < TARGET[1])";
                                                bodysource += depth + "\tSTACK.push(1);";
                                                bodysource += depth + "else";
                                                bodysource += depth + "\tSTACK.push(-1);";
                                                break;

                                            case JVM.Opcodes.IRETURN:
                                            case JVM.Opcodes.LRETURN:
                                            case JVM.Opcodes.FRETURN:
                                            case JVM.Opcodes.DRETURN:
                                            case JVM.Opcodes.ARETURN:
                                                bodysource += depth + "throw new RET(STACK.pop());";
                                                break;

                                            case JVM.Opcodes.IADD:
                                            case JVM.Opcodes.DADD:
                                            case JVM.Opcodes.FADD:
                                            case JVM.Opcodes.LADD:
                                                bodysource += depth + "TARGET=STACK.pop();";
                                                bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] + TARGET;";
                                                break;

                                            case JVM.Opcodes.ISUB:
                                            case JVM.Opcodes.DSUB:
                                            case JVM.Opcodes.FSUB:
                                            case JVM.Opcodes.LSUB:
                                                bodysource += depth + "TARGET=STACK.pop();";
                                                bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] - TARGET;";
                                                break;

                                            case JVM.Opcodes.IMUL:
                                            case JVM.Opcodes.DMUL:
                                            case JVM.Opcodes.FMUL:
                                            case JVM.Opcodes.LMUL:
                                                bodysource += depth + "TARGET=STACK.pop();";
                                                bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] * TARGET;";
                                                break;

                                            case JVM.Opcodes.IDIV:
                                            case JVM.Opcodes.DDIV:
                                            case JVM.Opcodes.FDIV:
                                            case JVM.Opcodes.LDIV:
                                                bodysource += depth + "TARGET=STACK.pop();";
                                                bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] / TARGET;";
                                                break;

                                            case JVM.Opcodes.IREM:
                                            case JVM.Opcodes.DREM:
                                            case JVM.Opcodes.FREM:
                                            case JVM.Opcodes.LREM:
                                                bodysource += depth + "TARGET=STACK.pop();";
                                                bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] % TARGET;";
                                                break;

                                            case JVM.Opcodes.DUP:
                                                bodysource += depth + "STACK.push(STACK[STACK.length-1]);";
                                                break;

                                            case JVM.Opcodes.DUP_X1:
                                                bodysource += depth + "STACK[STACK.length-3] = STACK[STACK.length-1];";
                                                break;

                                            case JVM.Opcodes.DUP_X2:
                                                bodysource += depth + "STACK[Math.max(0, STACK.length-4)] = STACK[STACK.length-1];";
                                                break;

                                            case JVM.Opcodes.ICONST_M1:
                                                bodysource += depth + "STACK.push(-1);";
                                                break;

                                            case JVM.Opcodes.ICONST_0:
                                            case JVM.Opcodes.FCONST_0:
                                            case JVM.Opcodes.DCONST_0:
                                            case JVM.Opcodes.LCONST_0:
                                                bodysource += depth + "STACK.push(0);";
                                                break;

                                            case JVM.Opcodes.ICONST_1:
                                            case JVM.Opcodes.FCONST_1:
                                            case JVM.Opcodes.DCONST_1:
                                            case JVM.Opcodes.LCONST_1:
                                                bodysource += depth + "STACK.push(1);";
                                                break;

                                            case JVM.Opcodes.ICONST_2:
                                            case JVM.Opcodes.FCONST_2:
                                                bodysource += depth + "STACK.push(2);";
                                                break;

                                            case JVM.Opcodes.ICONST_3:
                                                bodysource += depth + "STACK.push(3);";
                                                break;

                                            case JVM.Opcodes.ICONST_4:
                                                bodysource += depth + "STACK.push(4);";
                                                break;

                                            case JVM.Opcodes.ICONST_5:
                                                bodysource += depth + "STACK.push(5);";
                                                break;

                                            default:
                                                throw new Error("Unknown insn opcode: " + impl.opcode);
                                        }
                                        break;

                                    case "ldc":
                                        if("numericValue" in impl)
                                            bodysource += depth + "STACK.push(" + impl.numericValue + ");";
                                        else if("stringRef" in impl)
                                            bodysource += depth + "STACK.push(string" + impl.stringRef + ");";
                                        else if("stringValue" in impl) {
                                            if(impl.stringValue == undefined)
                                                bodysource += depth + "STACK.push($.jvm.createString(" + JSON.stringify(impl.stringValue) + "));";
                                        } else
                                            throw new Error("Unknown LDC Value");
                                        break;

                                    case "initobject":
                                        bodysource += depth + "$.jvm.Object.apply(this, []);";
                                        break;

                                    case "super":
                                        if(JVM.settings.verbose)
                                          console.log("Has ref", impl);
                                        bodysource += depth + impl.ref[1] + ".call(this)";
                                        break;

                                    case "method":
                                        var ownerID = impl.owner.replace(/\//g, ".");

                                        bodysource += depth;
                                        if(JVM.settings.dumpStack) {
                                            bodysource += depth + "console.log(\"";
                                            bodysource += ownerID;
                                            bodysource += ".";
                                            bodysource += impl.name;
                                            bodysource += impl.signature.raw;
                                            bodysource += "\", $.jvm.dumpStack(STACK), ";
                                            bodysource += impl.opcode;
                                            bodysource += ");";
                                        }

                                        var target;
                                        var argumentCount = impl.signature.args.length;
                                        if(impl.opcode == JVM.Opcodes.INVOKESPECIAL
                                                || impl.opcode == JVM.Opcodes.INVOKESPECIALREF) {
                                            bodysource += depth + "TARGET=STACK.splice(STACK.length-";
                                            bodysource += argumentCount+1;
                                            bodysource += ", 1)[0];";

                                            if($new && impl.name == "<init>") {
                                                if(impl.initref)
                                                  bodysource += depth + impl.initref[1] + ".call(TARGET);";
                                                else
                                                  bodysource += depth + ((impl.ref && impl.ref[0]) || "$.classloader.loadedClasses[" + JSON.stringify(ownerID) + "]") + ".$impl._.call(TARGET);";
                                                $new = null;
                                            }
                                            if(impl.ref)
                                              target = impl.ref[1];
                                            else
                                              target = "$.classloader.loadedClasses[" + JSON.stringify(ownerID) + "].$impl['" + impl.name + "$" + impl.signature.raw + "']";
                                        } else if(impl.opcode == JVM.Opcodes.INVOKEINTERFACE
                                                || impl.opcode == JVM.Opcodes.INVOKEVIRTUAL) {
                                            bodysource += depth + "TARGET=STACK.splice(STACK.length-";
                                            bodysource += argumentCount+1;
                                            bodysource += ", 1)[0]";

                                            target = "$.classloader.lookupImpl(TARGET, '" +impl.name + "$" + impl.signature.raw + "')";
                                        } else if(impl.opcode == JVM.Opcodes.INVOKESTATICREF)
                                            target = impl.ref[1];
                                        else if(impl.opcode == JVM.Opcodes.INVOKESTATIC)
                                            target = "$.classloader.loadedClasses[" + JSON.stringify(ownerID) + "].$impl['" + impl.name + "$" + impl.signature.raw + "']";
                                        else
                                            throw new Error("Unknown method opcode: " + impl.opcode);

                                        bodysource += depth;
                                        var isVoidMethod = impl.signature.return === JVM.Types.VOID;
                                        if(!isVoidMethod)
                                            bodysource += "STACK.push(";

                                        bodysource += target;
                                        if(argumentCount) {
                                            bodysource += ".apply(";
                                            if(impl.opcode == JVM.Opcodes.INVOKESTATIC
                                                    || impl.opcode == JVM.Opcodes.INVOKESTATICREF) {
                                                bodysource += "null, STACK.splice(STACK.length-";
                                                bodysource += argumentCount;
                                                bodysource += ", ";
                                                bodysource += argumentCount;
                                                bodysource += ")";
                                            } else if(impl.opcode == JVM.Opcodes.INVOKESPECIAL
                                                    || impl.opcode == JVM.Opcodes.INVOKESPECIALREF
                                                    || impl.opcode == JVM.Opcodes.INVOKEINTERFACE
                                                    || impl.opcode == JVM.Opcodes.INVOKEVIRTUAL) {
                                                bodysource += "TARGET, STACK.splice(STACK.length-";
                                                bodysource += argumentCount;
                                                bodysource += ", ";
                                                bodysource += argumentCount;
                                                bodysource += ")";
                                            } else {
                                                bodysource += "STACK.splice(STACK.length-";
                                                bodysource += argumentCount+1;
                                                bodysource += ", 1)[0], STACK.splice(STACK.length-";
                                                bodysource += argumentCount;
                                                bodysource += ", ";
                                                bodysource += argumentCount;
                                                bodysource += ")";
                                            }
                                        } else if(impl.opcode == JVM.Opcodes.INVOKESTATIC
                                                    || impl.opcode == JVM.Opcodes.INVOKESTATICREF)
                                            bodysource += "(";
                                        else if(impl.opcode == JVM.Opcodes.INVOKESPECIAL
                                                || impl.opcode == JVM.Opcodes.INVOKESPECIALREF
                                                || impl.opcode == JVM.Opcodes.INVOKEINTERFACE
                                                || impl.opcode == JVM.Opcodes.INVOKEVIRTUAL)
                                            bodysource += ".call(TARGET";
                                        else
                                            bodysource += ".call(STACK.pop()";
                                        bodysource += ")";

                                        if(!isVoidMethod)
                                            bodysource += ')';
                                        bodysource += ";";
                                        bodysource += depth;
                                        break;

                                    case "int":
                                        switch(impl.opcode) {
                                            case JVM.Opcodes.BIPUSH:
                                            case JVM.Opcodes.SIPUSH:
                                                bodysource += depth + "STACK.push(" + impl.operand + ");";
                                                break;

                                            default:
                                                throw new Error("Unknown int opcode: " + impl.opcode);

                                        }
                                        break;

                                    case "var":
                                        switch(impl.opcode) {
                                            case JVM.Opcodes.ALOAD:
                                            case JVM.Opcodes.LLOAD:
                                            case JVM.Opcodes.FLOAD:
                                            case JVM.Opcodes.DLOAD:
                                            case JVM.Opcodes.ILOAD:
                                                if(!isStatic)
                                                    impl.index --;
                                                if(impl.index < 0)
                                                    bodysource += depth + "STACK.push(this);";
                                                else
                                                    bodysource += depth + "STACK.push(" + ARGSNAME + "[" + impl.index + "]);";
                                                break;

                                            case JVM.Opcodes.ASTORE:
                                            case JVM.Opcodes.LSTORE:
                                                if(!isStatic)
                                                    impl.index --;
                                                if(impl.index < 0)
                                                    throw new JavaErrors.IllegalArgumentException("STORE called for this");
                                                else
                                                    bodysource += depth + ARGSNAME + "[" + impl.index + "] = STACK.pop();";
                                                break;

                                            default:
                                                throw new Error("Unknown var opcode: " + impl.opcode);
                                        }

                                        break;

                                    default:
                                        console.error(impl);
                                        throw new Error("Unknown implementation section");
                                }
                                if(JVM.settings.dumpImpl)
                                    bodysource += depth;
                            });


                        } catch(e) {
                            console.log("Unfinished source `" + source + bodysource + "`");
                            throw e;
                        }

                        if(hasReturn) {
                            bodysource += "\n\t} catch(e) {";
                            bodysource += "\n\t\tif(e instanceof RET)";
                            bodysource += "\n\t\t\treturn e.val;";
                            bodysource += "\n\t\te = $.jvm.convertError(e);";

                            bodysource += "\n\t\tthrow e;";
                            bodysource += "\n\t}";
                        }
                    }
                    bodysource += "\n}";

                    source += "\n([";
                    if(initSource)
                        source += initSource;
                    else
                        source += "null";
                    source += ",";
                    source += bodysource;
                    source += "])";

                    if(JVM.settings.dumpSource)
                        console.log("Compiled source `" + source + "`");
                    if(crash)// || methodID == "webtest.WebTest.b.run")
                        throw new Error();

                    var helper = {
                        jvm: $self.$jvm,
                        classloader: $self,

                        impl: $impl,
                        prop: $prop,
                        native: $native,
                        nativeData: $nativeData,

                        error: JavaErrors
                    };
                    var func = (function source_eval_helper() {
                        //console.trace("Compiling source");
                        try {
                            return eval(source);
                        } catch(e) {
                           console.error("Failed to compile", source);
			                     console.log(e.message, e.stack);

                           throw e;
                        }
                    }).call(helper);

                    if(func[0]) {
                        var init = func[0];
                        inits.push(function() {
                            try {
                                init();
                            } catch(e) {
                                e = $self.$jvm.convertError(e);
                                java_printstacktrace(e);

                                $impl[id] = function() {
                                    throw e;
                                }
                            }
                        });
                    }
                    func = func[1];
                    Object.defineProperty(func, "$flags", {
                      value: section.access
                    });

                    if(section.name == "<clinit>")
                        inits.push(func);

                    if(section.access.indexOf(JVM.Flags.PRIVATE) != -1 || section.access.indexOf(JVM.Flags.PROTECTED) != -1)
                        func = java_notpublic_wrap(func);
                    if(section.access.indexOf(JVM.Flags.STATIC) != -1)
                        func = java_static_wrap(func);
                    func = $impl[id] = func;

                    //if(section.access.indexOf(JVM.Flags.PUBLIC) != -1)
                    //    $publicImpl[id] = func;


                    func.toString = function() {
                        return methodID;
                    };
                    break;

                case "field":
                    //if(section.access.indexOf(JVM.Flags.STATIC) > -1) {
                        if(section.access.indexOf(JVM.Flags.FINAL) > -1) {
                            if("numericValue" in section)
                                Object.defineProperty($prop, section.name, {
                                    value: section.numericValue
                                });
                            else if("stringValue" in section)
                                Object.defineProperty($prop, section.name, {
                                    value: section.stringValue
                                });
                            else
                                $prop[section.name] = JVM.Flags.FINAL;
                        } else
                            $prop[section.name] = null;
                    /* else {
                        if(section.access.indexOf(JVM.Flags.FINAL) > -1) {
                            if("numericValue" in section)
                                Object.defineProperty(impl.prototype, section.name, {
                                    value: section.numericValue
                                });
                            else if("stringValue" in section)
                                Object.defineProperty(impl.prototype, section.name, {
                                    value: section.stringValue
                                });
                            else
                                impl.prototype[section.name] = JVM.Flags.FINAL;
                        } else
                            console.error("Non final instance property: " + section.name);
                    }*/
                    break;

                default:
                    console.error("Unsupported type: " + section.type);
            }
        });

        this.registerImpl(name, impl);
        references.forEach(function(ref) {
            if(ref == name)
                return;

            $self.loadClassImpl(ref);
        });
        inits.forEach(function(init) {
            init();
        });

        if(JVM.settings.verbose)
          console.log("Compiled", name, impl);
        return impl;
    };
})(this);
